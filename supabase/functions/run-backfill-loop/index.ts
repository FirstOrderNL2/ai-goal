import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Drives backfill-training-predictions OR backfill-odds in a loop until either
 * `target` rows are reached, the cursor is exhausted, or `max_iterations` hit.
 *
 * Body:
 *   { target: "predictions" | "odds",
 *     max_iterations?: number (default 80),
 *     batch?: number,
 *     stop_at?: number (e.g. 2000 snapshots; checked between iterations) }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  const target: string = body.target || "predictions";
  const maxIter: number = Math.min(200, body.max_iterations ?? 80);
  const batch: number = body.batch ?? 25;
  const stopAt: number | null = body.stop_at ?? null;

  const fnName = target === "odds" ? "backfill-odds" : "backfill-training-predictions";
  const iterations: any[] = [];
  let cursor: string | null = null;
  let totalSucceeded = 0;
  let totalFailed = 0;
  let exhausted = false;

  for (let i = 0; i < maxIter; i++) {
    // Stop early if we've reached the snapshot target.
    if (stopAt && target === "predictions") {
      const { count } = await supabase
        .from("predictions")
        .select("id", { count: "exact", head: true })
        .not("feature_snapshot", "is", null);
      if ((count ?? 0) >= stopAt) {
        iterations.push({ i, stopped_early: true, snapshot_count: count });
        break;
      }
    }

    const payload: any = target === "odds"
      ? { scope: body.scope || "completed", max: batch * 2 }
      : { batch, cursor };

    const r = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(payload),
    });
    const json = await r.json().catch(() => ({}));
    iterations.push({ i, ok: r.ok, ...summarize(json) });

    if (!r.ok) break;
    if (target === "predictions") {
      totalSucceeded += json.succeeded ?? 0;
      totalFailed += json.failed ?? 0;
      cursor = json.next_cursor ?? null;
      if (json.exhausted) { exhausted = true; break; }
    } else {
      totalSucceeded += json.inserted ?? 0;
      totalFailed += json.failed ?? 0;
      if ((json.candidates ?? 0) === 0) { exhausted = true; break; }
    }
  }

  return new Response(JSON.stringify({
    success: true,
    target,
    iterations: iterations.length,
    total_succeeded: totalSucceeded,
    total_failed: totalFailed,
    exhausted,
    last_cursor: cursor,
    log: iterations.slice(-10),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

function summarize(j: any) {
  return {
    processed: j.processed ?? j.candidates ?? null,
    succeeded: j.succeeded ?? j.inserted ?? null,
    failed: j.failed ?? null,
    next_cursor: j.next_cursor ?? null,
    exhausted: j.exhausted ?? null,
  };
}
