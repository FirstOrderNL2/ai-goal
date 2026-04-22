import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function classifyError(pred: any, match: any): string {
  const hw = Number(pred.home_win) || 0;
  const dr = Number(pred.draw) || 0;
  const aw = Number(pred.away_win) || 0;
  const conf = Number(pred.model_confidence) || 0;
  const gh = match.goals_home;
  const ga = match.goals_away;
  const actualHome = gh > ga;
  const actualDraw = gh === ga;
  const actualAway = ga > gh;
  const predHome = hw > dr && hw > aw;
  const predDraw = dr >= hw && dr >= aw && !predHome;

  const totalGoals = gh + ga;
  const predXG = (Number(pred.expected_goals_home) || 0) + (Number(pred.expected_goals_away) || 0);

  if (predHome && actualDraw) return "missed_draw";
  if (predHome && actualAway) return conf >= 0.6 ? "overconfident_home" : "wrong_winner";
  if (predDraw && (actualHome || actualAway)) return "false_draw";
  if (!predHome && !predDraw && actualHome) return conf >= 0.6 ? "overconfident_away" : "wrong_winner";
  if (totalGoals > predXG + 2) return "goals_underestimated";
  if (totalGoals < predXG - 2) return "goals_overestimated";

  return "general_miss";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const mode = (body?.mode || url.searchParams.get("mode") || "recent") as "recent" | "backfill";
    const isBackfill = mode === "backfill";
    const limit = isBackfill ? 1000 : 200;
    const ascending = isBackfill; // oldest-first when backfilling so old labels actually get filled
    const cursor: string | undefined = body?.after_date || url.searchParams.get("after_date") || undefined;

    // Find completed matches. In backfill mode we cursor forward by match_date so each
    // iteration progresses instead of re-scanning the same 500 oldest matches.
    let q = supabase
      .from("matches")
      .select("id, goals_home, goals_away, league, match_date")
      .eq("status", "completed")
      .not("goals_home", "is", null)
      .order("match_date", { ascending })
      .limit(limit);
    if (cursor) {
      q = ascending ? q.gt("match_date", cursor) : q.lt("match_date", cursor);
    }
    const { data: unreviewed, error } = await q;

    if (error) throw error;
    if (!unreviewed || unreviewed.length === 0) {
      return new Response(JSON.stringify({ message: "No completed matches", processed: 0, next_cursor: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const matchIds = unreviewed.map((m: any) => m.id);
    const lastMatchDate = unreviewed[unreviewed.length - 1].match_date;

    // Fetch predictions and existing reviews in chunks.
    // In backfill mode we include low_quality predictions — the actual outcome is ground
    // truth regardless of how confident the model was at prediction time.
    const chunkSize = 200;
    const allPreds: any[] = [];
    const allReviews: any[] = [];
    for (let i = 0; i < matchIds.length; i += chunkSize) {
      const chunk = matchIds.slice(i, i + chunkSize);
      let predQ = supabase.from("predictions").select("*").in("match_id", chunk);
      if (!isBackfill) predQ = predQ.neq("publish_status", "low_quality");
      const [{ data: preds }, { data: reviews }] = await Promise.all([
        predQ,
        supabase.from("prediction_reviews").select("match_id").in("match_id", chunk),
      ]);
      if (preds) allPreds.push(...preds);
      if (reviews) allReviews.push(...reviews);
    }

    const predMap = new Map(allPreds.map((p: any) => [p.match_id, p]));
    const reviewedSet = new Set(allReviews.map((r: any) => r.match_id));

    // Build reviews for matches that have predictions but no review yet
    const newReviews: any[] = [];
    for (const match of unreviewed) {
      if (reviewedSet.has(match.id)) continue;
      const pred = predMap.get(match.id);
      if (!pred) continue;

      const gh = match.goals_home!;
      const ga = match.goals_away!;
      const hw = Number(pred.home_win) || 0;
      const dr = Number(pred.draw) || 0;
      const aw = Number(pred.away_win) || 0;

      const actualOutcome = gh > ga ? "home" : gh === ga ? "draw" : "away";
      const predHome = hw > dr && hw > aw;
      const predDraw = dr >= hw && dr >= aw && !predHome;
      const predictedOutcome = predHome ? "home" : predDraw ? "draw" : "away";
      const outcomeCorrect = actualOutcome === predictedOutcome;

      const totalGoals = gh + ga;
      const predOver = pred.over_under_25 === "over";
      const ouCorrect = (totalGoals > 2.5 && predOver) || (totalGoals <= 2.5 && !predOver);

      const actualBtts = gh > 0 && ga > 0;
      const predBtts = pred.btts === "yes";
      const bttsCorrect = actualBtts === predBtts;

      const scoreCorrect = pred.predicted_score_home === gh && pred.predicted_score_away === ga;

      const goalsError = Math.abs((Number(pred.expected_goals_home) || 0) - gh) +
        Math.abs((Number(pred.expected_goals_away) || 0) - ga);

      const errorType = outcomeCorrect ? null : classifyError(pred, match);

      newReviews.push({
        match_id: match.id,
        prediction_id: pred.id,
        predicted_outcome: predictedOutcome,
        actual_outcome: actualOutcome,
        outcome_correct: outcomeCorrect,
        ou_correct: ouCorrect,
        btts_correct: bttsCorrect,
        score_correct: scoreCorrect,
        confidence_at_prediction: Number(pred.model_confidence) || 0,
        error_type: errorType,
        goals_error: Math.round(goalsError * 100) / 100,
        league: match.league,
      });
    }

    if (newReviews.length > 0) {
      // Insert in chunks
      for (let i = 0; i < newReviews.length; i += 50) {
        const chunk = newReviews.slice(i, i + 50);
        const { error: insertErr } = await supabase.from("prediction_reviews").upsert(chunk, { onConflict: "match_id" });
        if (insertErr) console.error("Review insert error:", insertErr);
      }
    }

    // Also trigger AI post-match reviews for unreviewed matches (limited).
    // Skipped entirely in backfill mode — Lovable AI rate limits would kill a 1700-row pass,
    // and we only need the structured prediction_reviews label for ML.
    const unreviewedAI = isBackfill ? [] : unreviewed.filter((m: any) =>
      predMap.has(m.id) && !m.ai_post_match_review
    );

    let aiProcessed = 0;
    for (let i = 0; i < Math.min(unreviewedAI.length, 6); i++) {
      // Check if match has ai_post_match_review
      const { data: matchCheck } = await supabase
        .from("matches")
        .select("ai_post_match_review")
        .eq("id", unreviewedAI[i].id)
        .single();

      if (matchCheck?.ai_post_match_review) continue;

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/generate-post-match-review`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ match_id: unreviewedAI[i].id }),
        });

        if (res.ok) {
          aiProcessed++;
        } else if (res.status === 429) {
          break;
        }
      } catch (e) {
        console.error("AI review error:", e);
      }

      if (i < unreviewedAI.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      mode,
      processed: newReviews.length,
      prediction_reviews_created: newReviews.length,
      ai_reviews_processed: aiProcessed,
      total_completed: unreviewed.length,
      next_cursor: lastMatchDate,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Batch review error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
