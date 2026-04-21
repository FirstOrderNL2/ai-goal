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
  let q = supabase
    .from("matches")
    .select("id, match_date, predictions(id, feature_snapshot)")
    .eq("status", "completed")
    .order("match_date", { ascending: false })
    .limit(batchSize * 4); // overshoot to allow filtering

  if (cursor) q = q.lt("match_date", cursor);

  const { data: candidates, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Filter: missing prediction OR prediction without feature_snapshot.
  const targets = (candidates ?? []).filter((m: any) => {
    const preds = m.predictions ?? [];
    if (preds.length === 0) return true;
    return !preds[0].feature_snapshot;
  }).slice(0, batchSize);

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const m of targets) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-statistical-prediction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ match_id: m.id, training_mode: true }),
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

  // Next cursor = earliest match_date in this batch (for pagination).
  const nextCursor = targets.length > 0
    ? (targets[targets.length - 1] as any).match_date
    : null;
  const exhausted = targets.length < batchSize;

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
