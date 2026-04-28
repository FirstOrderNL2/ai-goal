// Phase 2: Calibration event stream.
// For each completed match with a label and at least one pre_match prediction_run,
// emit one calibration_event per market (1x2_home/draw/away, btts, over_25, over_15, over_35).
// Idempotent per (prediction_run_id, market).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function bucketOf(p: number): string {
  // 10% buckets
  const idx = Math.min(9, Math.max(0, Math.floor(p * 10)));
  return `${idx * 10}-${(idx + 1) * 10}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const lookbackDays = Number(body.lookback_days ?? 30);
  const limit = Number(body.limit ?? 500);

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // Get labeled matches in window
  const { data: labels, error: lblErr } = await supabase
    .from("match_labels")
    .select("match_id, outcome, btts, over_15, over_25, over_35")
    .gte("finalized_at", since)
    .limit(limit);

  if (lblErr) {
    return new Response(JSON.stringify({ success: false, error: lblErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!labels?.length) {
    return new Response(JSON.stringify({ success: true, processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const matchIds = labels.map((l: any) => l.match_id);
  const labelByMatch = new Map(labels.map((l: any) => [l.match_id, l]));

  // Get pre-match runs for those matches.
  // CONFIRMATION 1 (Phase 3): calibration MUST only consume pre_match runs — never halftime
  // or live runs. The filter below is the single source of truth; do not widen it.
  const RUN_TYPE_FILTER = "pre_match" as const;
  const { data: runs, error: runErr } = await supabase
    .from("prediction_runs")
    .select("id, match_id, model_version, probabilities, run_type")
    .in("match_id", matchIds)
    .eq("run_type", RUN_TYPE_FILTER);

  // Defensive assertion — if any non-pre_match row slips through, abort and log.
  for (const r of (runs ?? []) as any[]) {
    if (r.run_type !== "pre_match") {
      console.error(`[append-calibration-events] BUG: non-pre_match run leaked: ${r.id} (${r.run_type})`);
      return new Response(JSON.stringify({
        success: false,
        error: `non-pre_match run detected: ${r.id} (${r.run_type})`,
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  if (runErr) {
    return new Response(JSON.stringify({ success: false, error: runErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!runs?.length) {
    return new Response(JSON.stringify({ success: true, processed: 0, reason: "no pre_match runs" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get league for each match (for per-league calibration)
  const { data: matches } = await supabase
    .from("matches")
    .select("id, league")
    .in("id", matchIds);
  const leagueByMatch = new Map((matches ?? []).map((m: any) => [m.id, m.league]));

  // Already-emitted (run_id, market) pairs
  const runIds = runs.map((r: any) => r.id);
  const { data: existingEvents } = await supabase
    .from("calibration_events")
    .select("prediction_run_id, market")
    .in("prediction_run_id", runIds);
  const have = new Set((existingEvents ?? []).map((e: any) => `${e.prediction_run_id}::${e.market}`));

  const rows: any[] = [];
  for (const run of runs) {
    const lbl = labelByMatch.get(run.match_id);
    if (!lbl) continue;
    const probs = (run.probabilities ?? {}) as Record<string, any>;
    const league = leagueByMatch.get(run.match_id) ?? null;

    const markets: Array<{ market: string; p: number | null; actual: boolean }> = [
      { market: "1x2_home", p: typeof probs.home_win === "number" ? probs.home_win : null, actual: lbl.outcome === "home" },
      { market: "1x2_draw", p: typeof probs.draw === "number" ? probs.draw : null, actual: lbl.outcome === "draw" },
      { market: "1x2_away", p: typeof probs.away_win === "number" ? probs.away_win : null, actual: lbl.outcome === "away" },
      { market: "btts", p: typeof probs.btts_yes === "number" ? probs.btts_yes : null, actual: !!lbl.btts },
      { market: "over_25", p: typeof probs.over_25 === "number" ? probs.over_25 : null, actual: !!lbl.over_25 },
    ];

    for (const m of markets) {
      if (m.p === null) continue;
      const key = `${run.id}::${m.market}`;
      if (have.has(key)) continue;
      rows.push({
        prediction_run_id: run.id,
        match_id: run.match_id,
        market: m.market,
        predicted_probability: m.p,
        actual_outcome: m.actual,
        league,
        bucket: bucketOf(m.p),
        model_version: run.model_version ?? "baseline-v1",
      });
    }
  }

  if (!rows.length) {
    return new Response(JSON.stringify({ success: true, processed: 0, reason: "all caught up" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error: insErr } = await supabase
    .from("calibration_events")
    .upsert(rows, { onConflict: "prediction_run_id,market", ignoreDuplicates: true });

  if (insErr) {
    return new Response(JSON.stringify({ success: false, error: insErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, processed: rows.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
