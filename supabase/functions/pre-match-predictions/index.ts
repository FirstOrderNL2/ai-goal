import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

  async function callPredict(matchId: string): Promise<boolean> {
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
    const { data: unpredicted } = await supabase
      .from("matches")
      .select("id")
      .eq("status", "upcoming")
      .not("id", "in", `(SELECT match_id FROM predictions)`)
      .order("match_date", { ascending: true })
      .limit(5);

    // Fallback: query matches then filter by missing prediction
    if (!unpredicted || unpredicted.length === 0) {
      const { data: upcoming } = await supabase
        .from("matches")
        .select("id")
        .eq("status", "upcoming")
        .order("match_date", { ascending: true })
        .limit(50);

      if (upcoming && upcoming.length > 0) {
        const ids = upcoming.map((m: any) => m.id);
        const { data: existing } = await supabase
          .from("predictions")
          .select("match_id")
          .in("match_id", ids);

        const existingIds = new Set((existing ?? []).map((p: any) => p.match_id));
        const missing = upcoming.filter((m: any) => !existingIds.has(m.id)).slice(0, 5);

        for (const match of missing) {
          const ok = await callPredict(match.id);
          log.push(`phase-a: ${match.id} → ${ok ? "OK" : "FAIL"}`);
          if (ok) totalProcessed++;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    } else {
      for (const match of unpredicted) {
        const ok = await callPredict(match.id);
        log.push(`phase-a: ${match.id} → ${ok ? "OK" : "FAIL"}`);
        if (ok) totalProcessed++;
        await new Promise((r) => setTimeout(r, 2000));
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

        const ok = await callPredict(match.id);
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

        const ok = await callPredict(match.id);
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
