import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const now = new Date();
  const log: string[] = [];
  let totalProcessed = 0;

  async function postJson(path: string, body: any): Promise<boolean> {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  const callEnrich = (id: string) => postJson("enrich-match-context", { match_id: id });
  const callFIL = (id: string) => postJson("football-intelligence", { match_id: id });
  const callImportance = (id: string) => postJson("compute-match-importance", { match_id: id });
  const callComputeFeatures = (id: string) => postJson("compute-features", { match_id: id });
  const callStatisticalPredict = (id: string, reason = "initial") =>
    postJson("generate-statistical-prediction", { match_id: id, update_reason: reason });
  const callAIPredict = (id: string) => postJson("generate-ai-prediction", { match_id: id });

  async function writeLog(matchId: string, action: string, status: string, reason?: string, error?: string) {
    try {
      await supabase.from("prediction_logs").insert({
        match_id: matchId,
        action,
        status,
        update_reason: reason ?? null,
        error: error?.slice(0, 500) ?? null,
      });
    } catch { /* swallow */ }
  }

  // Readiness probe + statistical predict with retry/backoff
  async function predictWithRetry(matchId: string, reason: string, maxRetries = 3): Promise<boolean> {
    // Readiness: ensure match_features row exists; fall back gracefully if not.
    const { data: featRow } = await supabase
      .from("match_features")
      .select("match_id")
      .eq("match_id", matchId)
      .maybeSingle();
    if (!featRow) {
      await callComputeFeatures(matchId).catch(() => {});
    }

    const backoffs = [0, 5000, 15000];
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (backoffs[attempt]) await new Promise((r) => setTimeout(r, backoffs[attempt]));
      const ok = await callStatisticalPredict(matchId, reason);
      if (ok) {
        await writeLog(matchId, "generate", "success", reason);
        return true;
      }
      await writeLog(matchId, "retry", "failed", reason, `attempt=${attempt + 1}`);
    }
    return false;
  }

  // ── Phase A: Initial predictions for matches without any ──
  {
    const { data: upcoming } = await supabase
      .from("matches")
      .select("id")
      .eq("status", "upcoming")
      .order("match_date", { ascending: true })
      .limit(300);

    if (upcoming && upcoming.length > 0) {
      const ids = upcoming.map((m: any) => m.id);
      const { data: existing } = await supabase
        .from("predictions")
        .select("match_id, ai_reasoning, last_prediction_at")
        .in("match_id", ids);

      const existingMap = new Map((existing ?? []).map((p: any) => [p.match_id, p]));

      const needsInitialPrediction = upcoming.filter((m: any) => !existingMap.get(m.id)).slice(0, 30);
      const needsAIEnrichment = upcoming.filter((m: any) => {
        const pred = existingMap.get(m.id);
        return pred && !pred.ai_reasoning;
      }).slice(0, 5);

      for (const match of needsInitialPrediction) {
        await callEnrich(match.id).catch(() => {});
        await callImportance(match.id).catch(() => {});
        await callFIL(match.id).catch(() => {});
        const ok = await predictWithRetry(match.id, "initial");
        log.push(`phase-a-stats: ${match.id} → ${ok ? "OK" : "FAIL"}`);
        if (ok) totalProcessed++;
        await new Promise((r) => setTimeout(r, 300));
      }

      if (needsAIEnrichment.length > 0) {
        const enrichIds = needsAIEnrichment.map((m: any) => m.id);
        const { data: contextRows } = await supabase
          .from("match_context")
          .select("match_id, scraped_at, lineup_home")
          .in("match_id", enrichIds);

        const contextMap = new Map((contextRows ?? []).map((c: any) => [c.match_id, c]));

        for (const match of needsAIEnrichment) {
          const pred = existingMap.get(match.id);
          const ctx = contextMap.get(match.id);
          const hasNewContext = ctx?.scraped_at && (!pred?.last_prediction_at || ctx.scraped_at > pred.last_prediction_at);
          const hasLineups = ctx?.lineup_home && (Array.isArray(ctx.lineup_home) ? ctx.lineup_home.length > 0 : true);

          if (hasNewContext || hasLineups) {
            const ok = await callAIPredict(match.id);
            log.push(`phase-a-ai: ${match.id} → ${ok ? "OK" : "FAIL"}`);
            if (ok) totalProcessed++;
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      }
    }
  }

  // ── Phase B: Explicit recheck windows T-60, T-30, T-15, T-10, T-5 ──
  // Each window has a tolerance band; we skip if the prediction is fresh enough for that window.
  // Window definition: { reason, minutesBefore, freshnessMinutes }
  const windows = [
    { reason: "recheck_60", minutesBefore: 60, freshnessMinutes: 25 },
    { reason: "recheck_30", minutesBefore: 30, freshnessMinutes: 13 },
    { reason: "recheck_15", minutesBefore: 15, freshnessMinutes: 7 },
    { reason: "recheck_10", minutesBefore: 10, freshnessMinutes: 4 },
    { reason: "recheck_5",  minutesBefore: 5,  freshnessMinutes: 3 },
  ];

  {
    const sixtyFiveMinFromNow = new Date(now.getTime() + 65 * 60 * 1000).toISOString();
    const { data: imminent } = await supabase
      .from("matches")
      .select("id, match_date")
      .eq("status", "upcoming")
      .gte("match_date", now.toISOString())
      .lte("match_date", sixtyFiveMinFromNow)
      .order("match_date", { ascending: true })
      .limit(40);

    if (imminent && imminent.length > 0) {
      const ids = imminent.map((m: any) => m.id);
      const { data: preds } = await supabase
        .from("predictions")
        .select("match_id, last_prediction_at, prediction_intervals, update_reason")
        .in("match_id", ids);

      const predMap = new Map((preds ?? []).map((p: any) => [p.match_id, p]));
      let refreshed = 0;
      const REFRESH_CAP = 10;

      for (const match of imminent) {
        if (refreshed >= REFRESH_CAP) break;

        const pred = predMap.get(match.id);
        const minutesLeft = Math.round((new Date(match.match_date).getTime() - now.getTime()) / 60000);

        // Find which window this match falls into (the closest one ≥ minutesLeft).
        const win = windows.find((w) => minutesLeft <= w.minutesBefore + 2 && minutesLeft >= w.minutesBefore - 4);
        if (!win) continue;

        // Skip if last refresh was inside the freshness band for this window
        if (pred?.last_prediction_at) {
          const ageMin = (now.getTime() - new Date(pred.last_prediction_at).getTime()) / 60000;
          if (ageMin < win.freshnessMinutes && pred.update_reason === win.reason) continue;
        }

        await callEnrich(match.id).catch(() => {});
        await callImportance(match.id).catch(() => {});
        await callFIL(match.id).catch(() => {});

        const ok = await predictWithRetry(match.id, win.reason);
        if (ok) {
          const intervals = pred?.prediction_intervals ?? [];
          intervals.push({ at: now.toISOString(), minutesBefore: minutesLeft, window: win.reason });
          await supabase
            .from("predictions")
            .update({
              prediction_intervals: intervals,
              last_prediction_at: now.toISOString(),
              update_reason: win.reason,
            })
            .eq("match_id", match.id);
          refreshed++;
          totalProcessed++;
          log.push(`phase-b ${win.reason}: ${match.id} (${minutesLeft}m left)`);
        } else {
          log.push(`phase-b ${win.reason}: ${match.id} FAILED after retries`);
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  // ── Phase C: Halftime prediction for live matches ──
  {
    const { data: htMatches } = await supabase
      .from("matches")
      .select("id")
      .eq("status", "HT")
      .limit(10);

    if (htMatches && htMatches.length > 0) {
      const ids = htMatches.map((m: any) => m.id);
      const { data: preds } = await supabase
        .from("predictions")
        .select("match_id, prediction_intervals, home_win, draw, away_win, expected_goals_home, expected_goals_away, over_under_25, model_confidence, predicted_score_home, predicted_score_away, btts, ai_reasoning, best_pick, best_pick_confidence, goal_distribution, goal_lines")
        .in("match_id", ids);

      const predMap = new Map((preds ?? []).map((p: any) => [p.match_id, p]));
      let htProcessed = 0;

      for (const match of htMatches) {
        if (htProcessed >= 3) break;
        const pred = predMap.get(match.id);
        const intervals: any[] = pred?.prediction_intervals ?? [];
        if (intervals.some((i: any) => i === "HT" || i?.label === "HT")) continue;

        if (pred) {
          const snapshot = {
            home_win: pred.home_win, draw: pred.draw, away_win: pred.away_win,
            expected_goals_home: pred.expected_goals_home, expected_goals_away: pred.expected_goals_away,
            over_under_25: pred.over_under_25, model_confidence: pred.model_confidence,
            predicted_score_home: pred.predicted_score_home, predicted_score_away: pred.predicted_score_away,
            btts: pred.btts, ai_reasoning: pred.ai_reasoning,
            best_pick: pred.best_pick, best_pick_confidence: pred.best_pick_confidence,
            goal_distribution: pred.goal_distribution, goal_lines: pred.goal_lines,
            snapshot_at: now.toISOString(),
          };
          await supabase.from("predictions").update({ pre_match_snapshot: snapshot }).eq("match_id", match.id);
        }

        const ok = await callAIPredict(match.id);
        if (ok) {
          intervals.push({ label: "HT", at: now.toISOString() });
          await supabase
            .from("predictions")
            .update({
              prediction_intervals: intervals,
              last_prediction_at: now.toISOString(),
              update_reason: "ht",
            })
            .eq("match_id", match.id);
          htProcessed++;
          totalProcessed++;
          await writeLog(match.id, "ht_snapshot", "success", "ht");
          log.push(`phase-c: ${match.id} HT prediction generated`);
        } else {
          await writeLog(match.id, "ht_snapshot", "failed", "ht");
          log.push(`phase-c: ${match.id} HT FAIL`);
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  // ── Phase D: Watchdog — re-queue any failed/pending predictions in next 24h ──
  {
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const { data: stuck } = await supabase
      .from("matches")
      .select("id, predictions!inner(generation_status, retry_count)")
      .eq("status", "upcoming")
      .gte("match_date", now.toISOString())
      .lte("match_date", in24h)
      .in("predictions.generation_status", ["failed", "pending"])
      .lt("predictions.retry_count", 3)
      .limit(15);

    if (stuck && stuck.length > 0) {
      for (const m of stuck as any[]) {
        const ok = await predictWithRetry(m.id, "retry");
        log.push(`phase-d watchdog: ${m.id} → ${ok ? "RECOVERED" : "STILL FAILING"}`);
        if (ok) totalProcessed++;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  // ── Phase E: Coverage guarantee — no kickoff without a successful prediction ──
  // Any upcoming match starting within the next 15 minutes that has no prediction row,
  // or a non-success generation_status, gets force-generated regardless of per-tick caps.
  {
    const in15m = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    const { data: imminent } = await supabase
      .from("matches")
      .select("id, predictions(generation_status)")
      .eq("status", "upcoming")
      .gte("match_date", now.toISOString())
      .lte("match_date", in15m)
      .limit(50);

    if (imminent && imminent.length > 0) {
      for (const m of imminent as any[]) {
        const pred = Array.isArray(m.predictions) ? m.predictions[0] : m.predictions;
        const status = pred?.generation_status;
        const needsForce = !pred || status === "failed" || status === "pending";
        if (!needsForce) continue;

        await callEnrich(m.id).catch(() => {});
        await callImportance(m.id).catch(() => {});
        await callFIL(m.id).catch(() => {});
        const ok = await predictWithRetry(m.id, "retry");
        log.push(`phase-e coverage-guard: ${m.id} → ${ok ? "FORCED" : "STILL MISSING"}`);
        if (ok) totalProcessed++;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  return new Response(
    JSON.stringify({ processed: totalProcessed, log }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
