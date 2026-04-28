// Phase 4.5: evaluate-challenger-model
// For each shadow artifact, finds shadow_predictions whose match has match_labels,
// computes challenger metrics on that set, and computes champion metrics from the
// matching prediction_runs (the production baseline that produced the run).
// Writes one evaluation_runs row per shadow artifact. Never auto-promotes.
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAdmin, corsHeaders } from "../_shared/admin-auth.ts";
import {
  multiclassLogLoss, brier1x2, rankedProbabilityScore,
  expectedCalibrationError, accuracy1x2, maeGoals,
  type ProbVec3, type Outcome,
} from "../_shared/metrics.ts";
import { evaluateGates, type LeagueMetric } from "../_shared/promotion-gates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function normalize(p: any): ProbVec3 {
  const h = Number(p?.home ?? 1 / 3);
  const d = Number(p?.draw ?? 1 / 3);
  const a = Number(p?.away ?? 1 / 3);
  const s = h + d + a || 1;
  return { home: h / s, draw: d / s, away: a / s };
}

function metricsBlock(rows: Array<{
  pred: ProbVec3; outcome: Outcome;
  goals_pred: { home: number; away: number };
  goals_actual: { home: number; away: number };
  league: string | null;
}>) {
  const preds = rows.map((r) => r.pred);
  const acts = rows.map((r) => r.outcome);
  const gp = rows.map((r) => r.goals_pred);
  const ga = rows.map((r) => r.goals_actual);
  return {
    n: rows.length,
    log_loss: multiclassLogLoss(preds, acts),
    brier: brier1x2(preds, acts),
    rps: rankedProbabilityScore(preds, acts),
    ece: expectedCalibrationError(preds, acts),
    accuracy: accuracy1x2(preds, acts),
    mae_goals: maeGoals(gp, ga),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.resp;

  let body: any = {};
  try { body = await req.json(); } catch { /* empty ok */ }
  const windowDays = Math.min(Math.max(Number(body.window_days ?? 30), 1), 180);
  const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1. Active shadow artifacts.
  const { data: artifacts, error: aErr } = await supabase
    .from("model_artifacts")
    .select("id, model_family, n_holdout")
    .eq("status", "shadow");
  if (aErr) {
    return new Response(JSON.stringify({ error: aErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!artifacts?.length) {
    return new Response(JSON.stringify({ ok: true, evaluated: 0, reason: "no shadow artifacts" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const evaluations: any[] = [];

  for (const art of artifacts) {
    // Champion artifact for the family (may be null).
    const { data: champion } = await supabase
      .from("model_artifacts")
      .select("id, metrics_json")
      .eq("model_family", art.model_family)
      .eq("status", "champion")
      .maybeSingle();

    // Pull shadow rows for this artifact joined to their pre_match prediction_runs.
    const { data: shadows } = await supabase
      .from("shadow_predictions")
      .select("prediction_run_id, probabilities, expected_goals, created_at")
      .eq("artifact_id", art.id)
      .gte("created_at", sinceIso);

    if (!shadows?.length) {
      evaluations.push({ artifact_id: art.id, n: 0, skipped: true });
      continue;
    }

    const runIds = shadows.map((s) => s.prediction_run_id);
    const { data: runs } = await supabase
      .from("prediction_runs")
      .select("id, match_id, probabilities, expected_goals")
      .in("id", runIds);

    const runById = new Map(runs?.map((r) => [r.id, r]) ?? []);
    const matchIds = Array.from(new Set((runs ?? []).map((r) => r.match_id)));
    if (!matchIds.length) {
      evaluations.push({ artifact_id: art.id, n: 0, skipped: true });
      continue;
    }

    const { data: labels } = await supabase
      .from("match_labels")
      .select("match_id, outcome, goals_home, goals_away")
      .in("match_id", matchIds);
    const labelByMatch = new Map(labels?.map((l) => [l.match_id, l]) ?? []);

    const { data: matchesMeta } = await supabase
      .from("matches")
      .select("id, league")
      .in("id", matchIds);
    const leagueByMatch = new Map(matchesMeta?.map((m) => [m.id, m.league]) ?? []);

    type Row = Parameters<typeof metricsBlock>[0][number];
    const challengerRows: Row[] = [];
    const championRows: Row[] = [];
    let windowStart: string | null = null;
    let windowEnd: string | null = null;

    for (const sh of shadows) {
      const run = runById.get(sh.prediction_run_id);
      if (!run) continue;
      const lbl = labelByMatch.get(run.match_id);
      if (!lbl) continue;

      const goalsActual = { home: lbl.goals_home, away: lbl.goals_away };
      const league = leagueByMatch.get(run.match_id) ?? null;
      const outcome = lbl.outcome as Outcome;
      const t = sh.created_at as string;
      if (!windowStart || t < windowStart) windowStart = t;
      if (!windowEnd || t > windowEnd) windowEnd = t;

      challengerRows.push({
        pred: normalize(sh.probabilities),
        outcome,
        goals_pred: {
          home: Number((sh.expected_goals as any)?.home ?? 1.4),
          away: Number((sh.expected_goals as any)?.away ?? 1.1),
        },
        goals_actual: goalsActual,
        league,
      });
      championRows.push({
        pred: normalize(run.probabilities),
        outcome,
        goals_pred: {
          home: Number((run.expected_goals as any)?.home ?? 1.4),
          away: Number((run.expected_goals as any)?.away ?? 1.1),
        },
        goals_actual: goalsActual,
        league,
      });
    }

    if (!challengerRows.length) {
      evaluations.push({ artifact_id: art.id, n: 0, skipped: true, reason: "no_labeled_shadow_rows" });
      continue;
    }

    const challengerMetrics = metricsBlock(challengerRows);
    const championMetrics = metricsBlock(championRows);

    // Per-league for collapse detection.
    const leagues = Array.from(new Set(challengerRows.map((r) => r.league).filter(Boolean))) as string[];
    const perLeague: LeagueMetric[] = leagues.map((lg) => {
      const ch = challengerRows.filter((r) => r.league === lg);
      const cp = championRows.filter((r) => r.league === lg);
      return {
        league: lg,
        n: ch.length,
        challenger: { log_loss: multiclassLogLoss(ch.map((r) => r.pred), ch.map((r) => r.outcome)) },
        champion: { log_loss: multiclassLogLoss(cp.map((r) => r.pred), cp.map((r) => r.outcome)) },
      };
    });

    const gate = evaluateGates({
      n_holdout: challengerRows.length,
      overall_challenger: {
        log_loss: challengerMetrics.log_loss,
        brier: challengerMetrics.brier,
        rps: challengerMetrics.rps,
        ece: challengerMetrics.ece,
        mae_goals: challengerMetrics.mae_goals,
      },
      overall_champion: {
        log_loss: championMetrics.log_loss,
        brier: championMetrics.brier,
        rps: championMetrics.rps,
        ece: championMetrics.ece,
        mae_goals: championMetrics.mae_goals,
      },
      recent_challenger: { log_loss: challengerMetrics.log_loss, brier: challengerMetrics.brier },
      recent_champion: { log_loss: championMetrics.log_loss, brier: championMetrics.brier },
      per_league: perLeague,
    });

    const { data: inserted } = await supabase
      .from("evaluation_runs")
      .insert({
        artifact_id: art.id,
        champion_artifact_id: champion?.id ?? null,
        window_start: windowStart ?? sinceIso,
        window_end: windowEnd ?? new Date().toISOString(),
        n_examples: challengerRows.length,
        metrics_challenger: challengerMetrics,
        metrics_champion: championMetrics,
        per_league_json: perLeague,
        passes_gate: gate.passes,
        gate_reasons: gate.reasons,
      })
      .select("id")
      .single();

    evaluations.push({
      artifact_id: art.id,
      evaluation_run_id: inserted?.id ?? null,
      n: challengerRows.length,
      passes_gate: gate.passes,
      gate_reasons: gate.reasons,
    });
  }

  return new Response(JSON.stringify({ ok: true, evaluated: evaluations.length, evaluations }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
