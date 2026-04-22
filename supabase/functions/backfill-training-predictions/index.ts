import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Phase 2: Backfill training predictions.
 * - Iterates completed matches in descending date order.
 * - For each match without a prediction OR whose prediction lacks feature_snapshot,
 *   calls generate-statistical-prediction with training_mode:true.
 * - Batched (default 25), idempotent, resumable via ?cursor=<ISO date>.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let cursor: string | null = null;
  let batchSize = 25;
  let delayMs = 250;
  try {
    const url = new URL(req.url);
    cursor = url.searchParams.get("cursor");
    const bs = url.searchParams.get("batch");
    if (bs) batchSize = Math.max(1, Math.min(50, parseInt(bs, 10)));
    const dl = url.searchParams.get("delay");
    if (dl) delayMs = Math.max(0, Math.min(2000, parseInt(dl, 10)));
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      cursor = body.cursor ?? cursor;
      if (body.batch) batchSize = Math.max(1, Math.min(50, body.batch));
      if (body.delay != null) delayMs = Math.max(0, Math.min(2000, body.delay));
    }
  } catch { /* defaults */ }

  // Find candidate completed matches (older than cursor if provided).
  // CRITICAL: Only backfill matches >7 days old. Anything more recent should
  // have received a real pre-kickoff prediction; silently writing a
  // training_only row here would mask coverage misses from the UI and ops.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let q = supabase
    .from("matches")
    .select("id, match_date, predictions(id, feature_snapshot)")
    .eq("status", "completed")
    .lt("match_date", sevenDaysAgo)
    .order("match_date", { ascending: false })
    .limit(Math.max(batchSize * 20, 200)); // big overshoot — most recent matches already have snapshots

  if (cursor) q = q.lt("match_date", cursor);

  const { data: candidates, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Filter: missing prediction OR prediction without feature_snapshot.
  // `predictions` may come back as an array (1:N) or a single object (1:1) depending on FK.
  const targets = (candidates ?? []).filter((m: any) => {
    const raw = m.predictions;
    if (raw == null) return true;
    const arr = Array.isArray(raw) ? raw : [raw];
    if (arr.length === 0) return true;
    return !arr[0]?.feature_snapshot;
  }).slice(0, batchSize) as Array<{ id: string; match_date: string }>;

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const m of targets) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-statistical-prediction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        // Priority 2: tag every backfill call with `backfill: true` and the
        // strict pre-match cutoff (`as_of = match_date`) so the prediction
        // engine refuses any post-kickoff enrichment/intelligence and the
        // resulting snapshot is annotated for downstream auditors.
        body: JSON.stringify({
          match_id: m.id,
          training_mode: true,
          backfill: true,
          as_of: m.match_date,
        }),
      });
      if (res.ok) {
        results.push({ id: m.id, ok: true });
      } else {
        const txt = await res.text().catch(() => "");
        results.push({ id: m.id, ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 120)}` });
      }
    } catch (e) {
      results.push({ id: m.id, ok: false, error: (e as Error).message });
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  // Cursor advances by the OLDEST candidate seen in this window (so the next
  // call paginates further back), regardless of how many we filtered/processed.
  const oldestCandidate = (candidates && candidates.length > 0)
    ? (candidates[candidates.length - 1] as any).match_date
    : null;
  const nextCursor = oldestCandidate;
  // Exhausted only when the underlying query returned fewer rows than the
  // overshoot window — i.e. there are no more older completed matches.
  const exhausted = (candidates?.length ?? 0) < Math.max(batchSize * 20, 200);

  return new Response(JSON.stringify({
    success: true,
    processed: results.length,
    succeeded: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    next_cursor: exhausted ? null : nextCursor,
    exhausted,
    sample_errors: results.filter(r => !r.ok).slice(0, 3),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
