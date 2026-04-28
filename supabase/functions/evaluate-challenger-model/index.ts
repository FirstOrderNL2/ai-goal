// Phase 3: evaluate-challenger-model
// Replays the same metric set on an arbitrary window of training_examples using
// the BASELINE predictor (since this phase doesn't persist challenger artifacts).
// Useful for regression checks: "did our baseline get worse on the last 7 days?"
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  multiclassLogLoss, brier1x2, rankedProbabilityScore,
  expectedCalibrationError, accuracy1x2, maeGoals,
  type ProbVec3, type Outcome,
} from "../_shared/metrics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const modelFamily = String(body.model_family ?? "baseline");
  const datasetVersion = String(body.dataset_version ?? "v1");
  const since = body.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const until = body.until ?? new Date().toISOString();

  const { data, error } = await supabase
    .from("training_examples")
    .select("prediction_cutoff_ts, feature_snapshot, label_snapshot, league")
    .eq("model_family", modelFamily)
    .eq("dataset_version", datasetVersion)
    .gte("prediction_cutoff_ts", since)
    .lte("prediction_cutoff_ts", until)
    .order("prediction_cutoff_ts", { ascending: true })
    .limit(5000);

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = (data ?? []) as any[];
  if (!rows.length) {
    return new Response(JSON.stringify({ success: true, n: 0, reason: "no examples in window" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const preds: ProbVec3[] = [];
  const actuals: Outcome[] = [];
  const goalPreds: Array<{ home: number; away: number }> = [];
  const goalActuals: Array<{ home: number; away: number }> = [];

  for (const r of rows) {
    const f = r.feature_snapshot;
    const h = Number(f.poisson_home ?? 1 / 3);
    const d = Number(f.poisson_draw ?? 1 / 3);
    const a = Number(f.poisson_away ?? 1 / 3);
    const s = h + d + a || 1;
    preds.push({ home: h / s, draw: d / s, away: a / s });
    actuals.push(r.label_snapshot.outcome);
    goalPreds.push({ home: Number(f.xg_home ?? 1.4), away: Number(f.xg_away ?? 1.1) });
    goalActuals.push({ home: r.label_snapshot.goals_home, away: r.label_snapshot.goals_away });
  }

  const metrics = {
    n: rows.length,
    log_loss: multiclassLogLoss(preds, actuals),
    brier: brier1x2(preds, actuals),
    rps: rankedProbabilityScore(preds, actuals),
    ece: expectedCalibrationError(preds, actuals),
    accuracy: accuracy1x2(preds, actuals),
    mae_goals: maeGoals(goalPreds, goalActuals),
  };

  return new Response(JSON.stringify({ success: true, window: { since, until }, metrics }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
