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

  // Call enrichment layer (scrapes + signals)
  async function callEnrich(matchId: string): Promise<boolean> {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/enrich-match-context`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ match_id: matchId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Call Football Intelligence Layer
  async function callFIL(matchId: string): Promise<boolean> {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/football-intelligence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ match_id: matchId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Call statistical prediction (AI-free, fast)
  async function callStatisticalPredict(matchId: string): Promise<boolean> {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-statistical-prediction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ match_id: matchId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Call full AI prediction (expensive, for enrichment)
  async function callAIPredict(matchId: string): Promise<boolean> {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-ai-prediction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ match_id: matchId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Phase A: Initial predictions for matches without any ──
  {
    const { data: upcoming } = await supabase
      .from("matches")
      .select("id")
      .eq("status", "upcoming")
      .order("match_date", { ascending: true })
      .limit(200);

    if (upcoming && upcoming.length > 0) {
      const ids = upcoming.map((m: any) => m.id);
      const { data: existing } = await supabase
        .from("predictions")
        .select("match_id, ai_reasoning, last_prediction_at")
        .in("match_id", ids);

      const existingMap = new Map((existing ?? []).map((p: any) => [p.match_id, p]));

      // Find matches with no prediction at all
      const needsInitialPrediction = upcoming.filter((m: any) => {
        const pred = existingMap.get(m.id);
        return !pred;
      }).slice(0, 15);

      // Matches that have stats but no AI reasoning — enrich with AI only if new context exists
      const needsAIEnrichment = upcoming.filter((m: any) => {
        const pred = existingMap.get(m.id);
        return pred && !pred.ai_reasoning;
      }).slice(0, 5);

      // Phase A1: Enrich + generate statistical predictions
      for (const match of needsInitialPrediction) {
        // Run enrichment + FIL first (non-blocking failure)
        await callEnrich(match.id).catch(() => {});
        await callFIL(match.id).catch(() => {});
        const ok = await callStatisticalPredict(match.id);
        log.push(`phase-a-stats: ${match.id} → ${ok ? "OK" : "FAIL"}`);
        if (ok) totalProcessed++;
        await new Promise((r) => setTimeout(r, 500));
      }

      // Phase A2: Conditional AI enrichment — only when new context exists
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

          // Only call AI if: context is newer than last prediction, OR lineups confirmed
          const hasNewContext = ctx?.scraped_at && (!pred?.last_prediction_at || ctx.scraped_at > pred.last_prediction_at);
          const hasLineups = ctx?.lineup_home && (Array.isArray(ctx.lineup_home) ? ctx.lineup_home.length > 0 : true);

          if (hasNewContext || hasLineups) {
            const ok = await callAIPredict(match.id);
            log.push(`phase-a-ai: ${match.id} → ${ok ? "OK" : "FAIL"} (new_context=${!!hasNewContext}, lineups=${!!hasLineups})`);
            if (ok) totalProcessed++;
            await new Promise((r) => setTimeout(r, 2000));
          } else {
            log.push(`phase-a-ai: ${match.id} → SKIPPED (no new context)`);
          }
        }
      }
    }
  }

  // ── Phase B: Refresh predictions for matches within 60 min of kickoff ──
  {
    const sixtyMinFromNow = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const nineMinAgo = new Date(now.getTime() - 9 * 60 * 1000).toISOString();

    const { data: imminent } = await supabase
      .from("matches")
      .select("id, match_date")
      .eq("status", "upcoming")
      .gte("match_date", now.toISOString())
      .lte("match_date", sixtyMinFromNow)
      .order("match_date", { ascending: true })
      .limit(20);

    if (imminent && imminent.length > 0) {
      const ids = imminent.map((m: any) => m.id);
      const { data: preds } = await supabase
        .from("predictions")
        .select("match_id, last_prediction_at, prediction_intervals")
        .in("match_id", ids);

      const predMap = new Map((preds ?? []).map((p: any) => [p.match_id, p]));
      let refreshed = 0;

      for (const match of imminent) {
        if (refreshed >= 5) break;

        const pred = predMap.get(match.id);
        // Skip if predicted less than 9 minutes ago
        if (pred?.last_prediction_at && pred.last_prediction_at > nineMinAgo) {
          continue;
        }

        // Enrich + FIL before refreshing (captures latest lineups/news)
        await callEnrich(match.id).catch(() => {});
        await callFIL(match.id).catch(() => {});

        // Use statistical refresh (free) — AI enrichment only for first prediction
        const ok = await callStatisticalPredict(match.id);
        if (ok) {
          const intervals = pred?.prediction_intervals ?? [];
          const minutesLeft = Math.round(
            (new Date(match.match_date).getTime() - now.getTime()) / 60000
          );
          intervals.push({ at: now.toISOString(), minutesBefore: minutesLeft });

          await supabase
            .from("predictions")
            .update({
              prediction_intervals: intervals,
              last_prediction_at: now.toISOString(),
            })
            .eq("match_id", match.id);

          refreshed++;
          totalProcessed++;
          log.push(`phase-b: ${match.id} refreshed (${minutesLeft}m before kickoff)`);
        } else {
          log.push(`phase-b: ${match.id} FAIL`);
        }
        await new Promise((r) => setTimeout(r, 2000));
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

        // Skip if HT already done
        if (intervals.some((i: any) => i === "HT" || i?.label === "HT")) {
          continue;
        }

        // Snapshot current prediction before overwriting
        if (pred) {
          const snapshot = {
            home_win: pred.home_win,
            draw: pred.draw,
            away_win: pred.away_win,
            expected_goals_home: pred.expected_goals_home,
            expected_goals_away: pred.expected_goals_away,
            over_under_25: pred.over_under_25,
            model_confidence: pred.model_confidence,
            predicted_score_home: pred.predicted_score_home,
            predicted_score_away: pred.predicted_score_away,
            btts: pred.btts,
            ai_reasoning: pred.ai_reasoning,
            best_pick: pred.best_pick,
            best_pick_confidence: pred.best_pick_confidence,
            goal_distribution: pred.goal_distribution,
            goal_lines: pred.goal_lines,
            snapshot_at: now.toISOString(),
          };

          await supabase
            .from("predictions")
            .update({ pre_match_snapshot: snapshot })
            .eq("match_id", match.id);
        }

        // HT predictions use AI for full analysis since it's a key moment
        const ok = await callAIPredict(match.id);
        if (ok) {
          intervals.push({ label: "HT", at: now.toISOString() });
          await supabase
            .from("predictions")
            .update({
              prediction_intervals: intervals,
              last_prediction_at: now.toISOString(),
            })
            .eq("match_id", match.id);

          htProcessed++;
          totalProcessed++;
          log.push(`phase-c: ${match.id} HT prediction generated`);
        } else {
          log.push(`phase-c: ${match.id} HT FAIL`);
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  return new Response(
    JSON.stringify({ processed: totalProcessed, log }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
