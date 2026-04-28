// Phase 3: train-challenger-model
// Pulls labeled training_examples in a window, does a strict TIME-BASED 60/20/20 split,
// trains a tiny logistic-regression challenger on top of baseline Poisson features,
// and compares it on the holdout to the champion (baseline Poisson alone).
// Promotion requires beating champion on log loss AND Brier, with ECE not regressing > 1pp.
// NOTE: this phase records decisions only — it does NOT persist a model artifact for serving.
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

const MAX_ROWS = 5000;
const FEATURE_KEYS = [
  "poisson_home", "poisson_draw", "poisson_away",
  "xg_home", "xg_away",
  "elo_gap", "atk_home", "def_home", "atk_away", "def_away",
] as const;

type Example = {
  prediction_cutoff_ts: string;
  feature_snapshot: Record<string, number>;
  label_snapshot: { outcome: Outcome; goals_home: number; goals_away: number };
};

function softmax3(z: [number, number, number]): ProbVec3 {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e[0] + e[1] + e[2];
  return { home: e[0] / s, draw: e[1] / s, away: e[2] / s };
}

/** Tiny multinomial logistic regression in pure JS. */
function trainLogReg(
  X: number[][], y: Outcome[],
  opts = { lr: 0.05, epochs: 60, l2: 1e-4, batch: 32 },
) {
  const D = X[0].length;
  const W: number[][] = [Array(D).fill(0), Array(D).fill(0), Array(D).fill(0)];
  const b: number[] = [0, 0, 0];
  const N = X.length;
  const idx = (o: Outcome) => (o === "home" ? 0 : o === "draw" ? 1 : 2);

  for (let ep = 0; ep < opts.epochs; ep++) {
    // shuffle deterministically by epoch (avoids leakage by NOT shuffling across time during eval)
    const order = Array.from({ length: N }, (_, i) => i);
    for (let i = N - 1; i > 0; i--) {
      const j = ((ep * 9301 + i * 49297) % 233280) % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let bs = 0; bs < N; bs += opts.batch) {
      const slice = order.slice(bs, bs + opts.batch);
      const gW = [Array(D).fill(0), Array(D).fill(0), Array(D).fill(0)];
      const gb = [0, 0, 0];
      for (const i of slice) {
        const z: [number, number, number] = [b[0], b[1], b[2]];
        for (let d = 0; d < D; d++) {
          z[0] += W[0][d] * X[i][d];
          z[1] += W[1][d] * X[i][d];
          z[2] += W[2][d] * X[i][d];
        }
        const p = softmax3(z);
        const yi = idx(y[i]);
        const grad = [p.home - (yi === 0 ? 1 : 0), p.draw - (yi === 1 ? 1 : 0), p.away - (yi === 2 ? 1 : 0)];
        for (let c = 0; c < 3; c++) {
          gb[c] += grad[c];
          for (let d = 0; d < D; d++) gW[c][d] += grad[c] * X[i][d];
        }
      }
      const m = slice.length;
      for (let c = 0; c < 3; c++) {
        b[c] -= opts.lr * (gb[c] / m);
        for (let d = 0; d < D; d++) {
          W[c][d] -= opts.lr * (gW[c][d] / m + opts.l2 * W[c][d]);
        }
      }
    }
  }

  return (x: number[]): ProbVec3 => {
    const z: [number, number, number] = [b[0], b[1], b[2]];
    for (let d = 0; d < x.length; d++) {
      z[0] += W[0][d] * x[d];
      z[1] += W[1][d] * x[d];
      z[2] += W[2][d] * x[d];
    }
    return softmax3(z);
  };
}

function featurize(ex: Example): number[] {
  return FEATURE_KEYS.map((k) => Number(ex.feature_snapshot[k] ?? 0));
}

function baselinePredict(ex: Example): ProbVec3 {
  const f = ex.feature_snapshot;
  const h = Number(f.poisson_home ?? 1 / 3);
  const d = Number(f.poisson_draw ?? 1 / 3);
  const a = Number(f.poisson_away ?? 1 / 3);
  const s = h + d + a || 1;
  return { home: h / s, draw: d / s, away: a / s };
}

function baselineGoals(ex: Example): { home: number; away: number } {
  return {
    home: Number(ex.feature_snapshot.xg_home ?? 1.4),
    away: Number(ex.feature_snapshot.xg_away ?? 1.1),
  };
}

function evaluateOn(
  rows: Example[],
  predictor: (ex: Example) => ProbVec3,
  goalPredictor: (ex: Example) => { home: number; away: number },
) {
  const preds = rows.map(predictor);
  const actuals: Outcome[] = rows.map((r) => r.label_snapshot.outcome);
  const goalPreds = rows.map(goalPredictor);
  const goalActuals = rows.map((r) => ({ home: r.label_snapshot.goals_home, away: r.label_snapshot.goals_away }));
  return {
    n: rows.length,
    log_loss: multiclassLogLoss(preds, actuals),
    brier: brier1x2(preds, actuals),
    rps: rankedProbabilityScore(preds, actuals),
    ece: expectedCalibrationError(preds, actuals),
    accuracy: accuracy1x2(preds, actuals),
    mae_goals: maeGoals(goalPreds, goalActuals),
  };
}

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
  const jobId: string | undefined = body.job_id;

  // Either consume a queued job, or create one ad-hoc
  let job: any = null;
  if (jobId) {
    const { data } = await supabase.from("training_jobs").select("*").eq("id", jobId).maybeSingle();
    job = data;
  } else {
    const { data } = await supabase
      .from("training_jobs")
      .select("*")
      .eq("model_family", modelFamily)
      .eq("dataset_version", datasetVersion)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    job = data;
    if (!job) {
      const { data: newJob } = await supabase.from("training_jobs").insert({
        model_family: modelFamily, dataset_version: datasetVersion, status: "queued",
        notes: "ad-hoc invocation",
      }).select("*").single();
      job = newJob;
    }
  }

  if (!job) {
    return new Response(JSON.stringify({ success: false, error: "no job available" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SHADOW_THRESHOLD = 200; // Phase 3.5: keep shadow-only until ≥ 200 labeled examples
  await supabase.from("training_jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", job.id);

  try {
    // Pull training examples ordered by cutoff (oldest first)
    const { data: rowsData, error: rowsErr } = await supabase
      .from("training_examples")
      .select("prediction_cutoff_ts, feature_snapshot, label_snapshot, league")
      .eq("model_family", job.model_family)
      .eq("dataset_version", job.dataset_version)
      .order("prediction_cutoff_ts", { ascending: true })
      .limit(MAX_ROWS);

    if (rowsErr) throw rowsErr;
    const rows = (rowsData ?? []) as (Example & { league?: string | null })[];
    if (rows.length < 100) {
      throw new Error(`not enough training examples: ${rows.length} (need ≥ 100)`);
    }

    // Time-based split 60/20/20
    const nTrain = Math.floor(rows.length * 0.6);
    const nVal = Math.floor(rows.length * 0.2);
    const train = rows.slice(0, nTrain);
    const val = rows.slice(nTrain, nTrain + nVal);
    const holdout = rows.slice(nTrain + nVal);

    // Defensive temporal-leak guard
    const trainMaxTs = train[train.length - 1].prediction_cutoff_ts;
    const holdoutMinTs = holdout[0].prediction_cutoff_ts;
    if (trainMaxTs >= holdoutMinTs) {
      throw new Error(`temporal leak: train ends ${trainMaxTs}, holdout starts ${holdoutMinTs}`);
    }

    // Train challenger
    const X = train.map(featurize);
    const y: Outcome[] = train.map((r) => r.label_snapshot.outcome);
    const trained = trainLogRegWithWeights(X, y);
    const challenger = trained.predictor;

    // Evaluate on holdout (overall + recent 25% slice + per-league)
    const championMetrics = evaluateOn(holdout, baselinePredict, baselineGoals);
    const challengerMetrics = evaluateOn(
      holdout,
      (ex) => challenger(featurize(ex)),
      baselineGoals,
    );
    const valMetrics = evaluateOn(val, (ex) => challenger(featurize(ex)), baselineGoals);

    // Recent holdout slice (last 25% by time)
    const recentStart = Math.floor(holdout.length * 0.75);
    const recent = holdout.slice(recentStart);
    const recentChallenger = evaluateOn(recent, (ex) => challenger(featurize(ex)), baselineGoals);
    const recentChampion = evaluateOn(recent, baselinePredict, baselineGoals);

    // Per-league (top 5 by holdout volume)
    const leagueGroups = new Map<string, typeof holdout>();
    for (const r of holdout) {
      const k = String(r.league ?? "unknown");
      if (!leagueGroups.has(k)) leagueGroups.set(k, []);
      leagueGroups.get(k)!.push(r);
    }
    const perLeague = [...leagueGroups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5)
      .map(([league, group]) => ({
        league,
        n: group.length,
        challenger: { log_loss: evaluateOn(group, (ex) => challenger(featurize(ex)), baselineGoals).log_loss },
        champion: { log_loss: evaluateOn(group, baselinePredict, baselineGoals).log_loss },
      }));

    const totalLabeled = rows.length;
    const inShadowMode = totalLabeled < SHADOW_THRESHOLD;

    // Phase 3.5: keep_champion always while in shadow mode
    const beatsLL = challengerMetrics.log_loss < championMetrics.log_loss;
    const beatsBrier = challengerMetrics.brier < championMetrics.brier;
    const eceOk = challengerMetrics.ece <= championMetrics.ece + 0.01;
    const naturalDecision = (beatsLL && beatsBrier && eceOk) ? "promote" : "keep_champion";
    const decision = inShadowMode ? "keep_champion" : naturalDecision;
    const shadowNote = inShadowMode ? `shadow_mode: ${totalLabeled} < ${SHADOW_THRESHOLD} labeled examples` : "";

    const metricsJson = {
      overall: challengerMetrics,
      recent_holdout: recentChallenger,
      val: valMetrics,
      per_league: perLeague,
    };
    const championMetricsJson = {
      overall: championMetrics,
      recent_holdout: recentChampion,
    };

    // Phase 4: persist model artifact in shadow status
    const { data: artifact, error: artErr } = await supabase
      .from("model_artifacts")
      .insert({
        model_family: job.model_family,
        feature_version: "v1",
        dataset_version: job.dataset_version,
        hyperparameters: { lr: 0.05, epochs: 60, l2: 1e-4, batch: 32, feature_keys: FEATURE_KEYS },
        weights: { W: trained.W, b: trained.b, feature_keys: FEATURE_KEYS },
        train_window_start: train[0].prediction_cutoff_ts,
        train_window_end: trainMaxTs,
        validation_window_start: val[0]?.prediction_cutoff_ts ?? null,
        validation_window_end: val[val.length - 1]?.prediction_cutoff_ts ?? null,
        holdout_window_start: holdoutMinTs,
        holdout_window_end: holdout[holdout.length - 1].prediction_cutoff_ts,
        n_train: train.length,
        n_val: val.length,
        n_holdout: holdout.length,
        metrics_json: metricsJson,
        status: "shadow",
        created_by_job_id: job.id,
        notes: shadowNote || `auto-trained job ${job.id}`,
      })
      .select("id")
      .single();
    if (artErr) console.error("[model_artifacts] insert failed:", artErr.message);

    // Phase 4: log an evaluation_runs row vs current champion (if any)
    const { data: currentChampion } = await supabase
      .from("model_artifacts")
      .select("id")
      .eq("model_family", job.model_family)
      .eq("status", "champion")
      .maybeSingle();

    if (artifact) {
      await supabase.from("evaluation_runs").insert({
        artifact_id: artifact.id,
        champion_artifact_id: currentChampion?.id ?? null,
        window_start: holdoutMinTs,
        window_end: holdout[holdout.length - 1].prediction_cutoff_ts,
        n_examples: holdout.length,
        metrics_challenger: metricsJson,
        metrics_champion: championMetricsJson,
        per_league_json: { entries: perLeague },
        passes_gate: !inShadowMode && naturalDecision === "promote",
        gate_reasons: inShadowMode ? [shadowNote] : (naturalDecision === "promote" ? [] : ["overall_metrics_not_better"]),
      });
    }

    await supabase.from("training_jobs").update({
      status: "succeeded",
      finished_at: new Date().toISOString(),
      train_window_start: train[0].prediction_cutoff_ts,
      train_window_end: trainMaxTs,
      holdout_window_start: holdoutMinTs,
      holdout_window_end: holdout[holdout.length - 1].prediction_cutoff_ts,
      n_train: train.length,
      n_holdout: holdout.length,
      metrics_json: metricsJson,
      champion_metrics_json: championMetricsJson,
      decision,
      notes: `${job.notes ?? ""} | ${shadowNote} | ll: ${challengerMetrics.log_loss.toFixed(4)} vs ${championMetrics.log_loss.toFixed(4)} | brier: ${challengerMetrics.brier.toFixed(4)} vs ${championMetrics.brier.toFixed(4)} | artifact: ${artifact?.id ?? "n/a"}`,
    }).eq("id", job.id);

    return new Response(JSON.stringify({
      success: true,
      job_id: job.id,
      artifact_id: artifact?.id ?? null,
      decision,
      shadow_mode: inShadowMode,
      challenger: challengerMetrics,
      champion: championMetrics,
      n_train: train.length,
      n_holdout: holdout.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = (e as Error).message;
    await supabase.from("training_jobs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: msg,
    }).eq("id", job.id);
    return new Response(JSON.stringify({ success: false, error: msg, job_id: job.id }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
