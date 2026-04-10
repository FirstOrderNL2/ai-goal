import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1. Get all votes with their prediction outcomes
    const { data: votes, error: votesErr } = await supabase
      .from("prediction_votes")
      .select("user_id, prediction_id, vote_type");
    if (votesErr) throw votesErr;
    if (!votes || votes.length === 0) {
      return new Response(JSON.stringify({ message: "No votes found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get all prediction reviews (completed matches)
    const { data: reviews, error: revErr } = await supabase
      .from("prediction_reviews")
      .select("match_id, outcome_correct");
    if (revErr) throw revErr;

    // Build a map: prediction_id is not directly in reviews, we need match_id
    // Get predictions to map prediction_id -> match_id
    const predictionIds = [...new Set(votes.map((v) => v.prediction_id))];
    
    // Batch fetch predictions
    const { data: predictions, error: predErr } = await supabase
      .from("predictions")
      .select("id, match_id")
      .in("id", predictionIds);
    if (predErr) throw predErr;

    const predToMatch = new Map<string, string>();
    for (const p of predictions || []) {
      predToMatch.set(p.id, p.match_id);
    }

    const reviewMap = new Map<string, boolean>();
    for (const r of reviews || []) {
      if (r.outcome_correct != null) {
        reviewMap.set(r.match_id, r.outcome_correct);
      }
    }

    // 3. Aggregate per user
    const userStats = new Map<string, { total: number; correct: number }>();

    for (const vote of votes) {
      const matchId = predToMatch.get(vote.prediction_id);
      if (!matchId) continue;
      const outcomeCorrect = reviewMap.get(matchId);
      if (outcomeCorrect === undefined) continue; // match not yet reviewed

      const stats = userStats.get(vote.user_id) || { total: 0, correct: 0 };
      stats.total++;

      // "like" on a correct prediction = correct vote
      // "dislike" on an incorrect prediction = correct vote
      if (
        (vote.vote_type === "like" && outcomeCorrect === true) ||
        (vote.vote_type === "dislike" && outcomeCorrect === false)
      ) {
        stats.correct++;
      }
      userStats.set(vote.user_id, stats);
    }

    // 4. Compute scores and upsert
    const maxVotes = Math.max(...[...userStats.values()].map((s) => s.total), 1);
    let updated = 0;

    for (const [userId, stats] of userStats) {
      const accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
      const volumeWeight = Math.min(stats.total / maxVotes, 1);
      // Consistency: how close to recent accuracy (simplified as accuracy stability)
      const consistency = stats.total >= 5 ? 0.8 : stats.total >= 3 ? 0.5 : 0.2;

      const trustScore = accuracy * 0.6 + volumeWeight * 0.2 + consistency * 0.2;
      const tier = accuracy >= 0.7 ? "pro" : accuracy >= 0.5 ? "average" : "low";

      const { error: upsertErr } = await supabase
        .from("user_performance")
        .upsert(
          {
            user_id: userId,
            total_votes: stats.total,
            correct_votes: stats.correct,
            accuracy_score: Math.round(accuracy * 1000) / 1000,
            trust_score: Math.round(trustScore * 1000) / 1000,
            tier,
            last_updated: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      if (upsertErr) console.error(`Failed to upsert user ${userId}:`, upsertErr);
      else updated++;
    }

    return new Response(
      JSON.stringify({ message: `Updated ${updated} user performance records` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("compute-user-performance error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
