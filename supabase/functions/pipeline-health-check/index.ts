// Phase 5: pipeline health check. Runs every 15 min via cron.
// Writes one pipeline_health row per condition that fires.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/admin-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const alerts: { check_type: string; severity: string; message: string; details: any }[] = [];
  const nowIso = new Date().toISOString();

  // 1. No new pre-match runs in last 6h while there are upcoming matches in next 24h
  const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const next24h = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const [{ count: recentRuns }, { count: upcoming }] = await Promise.all([
    supabase.from("prediction_runs").select("id", { count: "exact", head: true })
      .eq("run_type", "pre_match").gte("created_at", sixHoursAgo),
    supabase.from("matches").select("id", { count: "exact", head: true })
      .eq("status", "upcoming").gte("match_date", nowIso).lte("match_date", next24h),
  ]);
  if ((recentRuns ?? 0) === 0 && (upcoming ?? 0) > 0) {
    alerts.push({
      check_type: "no_pre_match_runs_6h",
      severity: "error",
      message: `No pre-match prediction_runs in last 6h despite ${upcoming} upcoming matches in next 24h`,
      details: { recent_runs: recentRuns, upcoming },
    });
  }

  // 2. No new match_labels in last 12h while there are completed matches
  const twelveHoursAgo = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const [{ count: recentLabels }, { count: recentFinished }] = await Promise.all([
    supabase.from("match_labels").select("match_id", { count: "exact", head: true })
      .gte("finalized_at", twelveHoursAgo),
    supabase.from("matches").select("id", { count: "exact", head: true })
      .in("status", ["finished", "FT", "AET", "PEN"])
      .gte("match_date", twelveHoursAgo),
  ]);
  if ((recentLabels ?? 0) === 0 && (recentFinished ?? 0) > 0) {
    alerts.push({
      check_type: "no_labels_12h",
      severity: "warn",
      message: `No new match_labels in last 12h despite ${recentFinished} recently-finished matches`,
      details: { recent_labels: recentLabels, recent_finished: recentFinished },
    });
  }

  // 3. Failed training jobs in last 24h
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: failedJobs } = await supabase.from("training_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed").gte("created_at", oneDayAgo);
  if ((failedJobs ?? 0) > 0) {
    alerts.push({
      check_type: "training_failures_24h",
      severity: "warn",
      message: `${failedJobs} training jobs failed in last 24h`,
      details: { failed_jobs: failedJobs },
    });
  }

  // 4. Calibration drift: ECE last 7d vs prior 30d
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const thirtySevenDaysAgo = new Date(Date.now() - 37 * 24 * 3600 * 1000).toISOString();
  const { data: ce } = await supabase.from("calibration_events")
    .select("predicted_probability, actual_outcome, created_at")
    .gte("created_at", thirtySevenDaysAgo);
  if (ce && ce.length >= 100) {
    const recent = ce.filter((r) => r.created_at >= sevenDaysAgo);
    const prior = ce.filter((r) => r.created_at < sevenDaysAgo);
    const eceOf = (rows: any[]) => {
      if (!rows.length) return 0;
      // 10-bin ECE
      const bins: { sumP: number; sumY: number; n: number }[] = Array.from({ length: 10 }, () => ({ sumP: 0, sumY: 0, n: 0 }));
      for (const r of rows) {
        const p = Number(r.predicted_probability);
        if (!Number.isFinite(p)) continue;
        const idx = Math.min(9, Math.max(0, Math.floor(p * 10)));
        bins[idx].sumP += p;
        bins[idx].sumY += r.actual_outcome ? 1 : 0;
        bins[idx].n += 1;
      }
      const N = rows.length;
      let ece = 0;
      for (const b of bins) {
        if (!b.n) continue;
        ece += (b.n / N) * Math.abs(b.sumY / b.n - b.sumP / b.n);
      }
      return ece;
    };
    const eceRecent = eceOf(recent);
    const ecePrior = eceOf(prior);
    if (eceRecent - ecePrior > 0.05) {
      alerts.push({
        check_type: "calibration_drift",
        severity: "warn",
        message: `ECE drifted +${((eceRecent - ecePrior) * 100).toFixed(1)}pp (now ${(eceRecent * 100).toFixed(1)}%, prior ${(ecePrior * 100).toFixed(1)}%)`,
        details: { ece_recent: eceRecent, ece_prior: ecePrior, n_recent: recent.length, n_prior: prior.length },
      });
    }
  }

  // Persist alerts (dedupe by check_type within last 6h)
  const sixHrAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const inserted: any[] = [];
  for (const a of alerts) {
    const { data: existing } = await supabase
      .from("pipeline_health")
      .select("id")
      .eq("check_type", a.check_type)
      .gte("created_at", sixHrAgo)
      .is("acknowledged_at", null)
      .maybeSingle();
    if (existing) continue;
    const { data, error } = await supabase
      .from("pipeline_health")
      .insert(a)
      .select("id, check_type, severity")
      .single();
    if (!error) inserted.push(data);
  }

  // Phase 4.5: also collect 24h pipeline counters and store as an info snapshot.
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [
    { count: c_pre_match },
    { count: c_calibration },
    { count: c_examples },
    { count: c_jobs_succeeded },
    { count: c_jobs_failed },
    { count: c_shadow_artifacts },
    { count: c_evaluation_runs },
    { count: c_shadow_predictions },
    { count: c_match_labels },
  ] = await Promise.all([
    supabase.from("prediction_runs").select("id", { count: "exact", head: true })
      .eq("run_type", "pre_match").gte("created_at", dayAgo),
    supabase.from("calibration_events").select("id", { count: "exact", head: true })
      .gte("created_at", dayAgo),
    supabase.from("training_examples").select("id", { count: "exact", head: true })
      .gte("created_at", dayAgo),
    supabase.from("training_jobs").select("id", { count: "exact", head: true })
      .eq("status", "succeeded").gte("created_at", dayAgo),
    supabase.from("training_jobs").select("id", { count: "exact", head: true })
      .eq("status", "failed").gte("created_at", dayAgo),
    supabase.from("model_artifacts").select("id", { count: "exact", head: true })
      .eq("status", "shadow").gte("created_at", dayAgo),
    supabase.from("evaluation_runs").select("id", { count: "exact", head: true })
      .gte("created_at", dayAgo),
    supabase.from("shadow_predictions").select("id", { count: "exact", head: true })
      .gte("created_at", dayAgo),
    supabase.from("match_labels").select("match_id", { count: "exact", head: true })
      .gte("finalized_at", dayAgo),
  ]);

  // Avg lag (hours) prediction_runs.created_at -> match_labels.finalized_at for last 7d
  let avg_label_lag_hours: number | null = null;
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: lagRows } = await supabase
    .from("match_labels")
    .select("match_id, finalized_at")
    .gte("finalized_at", sevenDaysAgoIso)
    .limit(500);
  if (lagRows && lagRows.length) {
    const matchIdsForLag = lagRows.map((l) => l.match_id);
    const { data: firstRuns } = await supabase
      .from("prediction_runs")
      .select("match_id, created_at")
      .eq("run_type", "pre_match")
      .in("match_id", matchIdsForLag)
      .order("created_at", { ascending: true });
    const firstByMatch = new Map<string, string>();
    for (const r of firstRuns ?? []) {
      if (!firstByMatch.has(r.match_id)) firstByMatch.set(r.match_id, r.created_at);
    }
    const lags: number[] = [];
    for (const l of lagRows) {
      const t0 = firstByMatch.get(l.match_id);
      if (!t0) continue;
      lags.push((new Date(l.finalized_at).getTime() - new Date(t0).getTime()) / 3600000);
    }
    if (lags.length) {
      avg_label_lag_hours = lags.reduce((a, b) => a + b, 0) / lags.length;
    }
  }

  const counters = {
    pre_match_runs_24h: c_pre_match ?? 0,
    calibration_events_24h: c_calibration ?? 0,
    training_examples_24h: c_examples ?? 0,
    training_jobs_succeeded_24h: c_jobs_succeeded ?? 0,
    training_jobs_failed_24h: c_jobs_failed ?? 0,
    shadow_artifacts_24h: c_shadow_artifacts ?? 0,
    evaluation_runs_24h: c_evaluation_runs ?? 0,
    shadow_predictions_24h: c_shadow_predictions ?? 0,
    match_labels_24h: c_match_labels ?? 0,
    avg_label_lag_hours_7d: avg_label_lag_hours,
  };

  await supabase.from("pipeline_health").insert({
    check_type: "daily_counters",
    severity: "info",
    message: "24h pipeline counters snapshot",
    details: counters,
  });

  return new Response(JSON.stringify({ ok: true, evaluated: alerts.length, inserted, counters }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
