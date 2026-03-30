import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { match_id } = await req.json();
    if (!match_id) {
      return new Response(JSON.stringify({ error: "match_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch match with teams
    const { data: match } = await supabase
      .from("matches")
      .select("*, home_team:teams!matches_team_home_id_fkey(*), away_team:teams!matches_team_away_id_fkey(*)")
      .eq("id", match_id)
      .single();

    if (!match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch prediction data
    const { data: prediction } = await supabase
      .from("predictions")
      .select("*")
      .eq("match_id", match_id)
      .single();

    // Fetch odds
    const { data: odds } = await supabase
      .from("odds")
      .select("*")
      .eq("match_id", match_id)
      .single();

    // Fetch recent form (last 5 matches for each team)
    const { data: homeForm } = await supabase
      .from("matches")
      .select("goals_home, goals_away, team_home_id, team_away_id, status, xg_home, xg_away")
      .or(`team_home_id.eq.${match.team_home_id},team_away_id.eq.${match.team_home_id}`)
      .eq("status", "completed")
      .order("match_date", { ascending: false })
      .limit(5);

    const { data: awayForm } = await supabase
      .from("matches")
      .select("goals_home, goals_away, team_home_id, team_away_id, status, xg_home, xg_away")
      .or(`team_home_id.eq.${match.team_away_id},team_away_id.eq.${match.team_away_id}`)
      .eq("status", "completed")
      .order("match_date", { ascending: false })
      .limit(5);

    // Build context for AI
    const context = {
      match: {
        date: match.match_date,
        league: match.league,
        homeTeam: match.home_team?.name,
        awayTeam: match.away_team?.name,
        status: match.status,
        score: match.status === "completed" ? `${match.goals_home}-${match.goals_away}` : null,
        xg: match.xg_home != null ? `${match.xg_home}-${match.xg_away}` : null,
      },
      prediction: prediction
        ? {
            homeWin: `${Math.round(prediction.home_win * 100)}%`,
            draw: `${Math.round(prediction.draw * 100)}%`,
            awayWin: `${Math.round(prediction.away_win * 100)}%`,
            expectedGoals: `${prediction.expected_goals_home}-${prediction.expected_goals_away}`,
            overUnder25: prediction.over_under_25,
            confidence: `${Math.round(prediction.model_confidence * 100)}%`,
          }
        : null,
      odds: odds
        ? { home: odds.home_win_odds, draw: odds.draw_odds, away: odds.away_win_odds }
        : null,
      homeRecentForm: homeForm?.map((m) => {
        const isHome = m.team_home_id === match.team_home_id;
        const goalsFor = isHome ? m.goals_home : m.goals_away;
        const goalsAgainst = isHome ? m.goals_away : m.goals_home;
        const result = goalsFor! > goalsAgainst! ? "W" : goalsFor === goalsAgainst ? "D" : "L";
        return `${result} (${goalsFor}-${goalsAgainst})`;
      }),
      awayRecentForm: awayForm?.map((m) => {
        const isHome = m.team_home_id === match.team_away_id;
        const goalsFor = isHome ? m.goals_home : m.goals_away;
        const goalsAgainst = isHome ? m.goals_away : m.goals_home;
        const result = goalsFor! > goalsAgainst! ? "W" : goalsFor === goalsAgainst ? "D" : "L";
        return `${result} (${goalsFor}-${goalsAgainst})`;
      }),
    };

    const prompt = `You are an expert football analyst. Analyze this match and provide detailed insights.

Match: ${context.match.homeTeam} vs ${context.match.awayTeam}
League: ${context.match.league}
Date: ${context.match.date}
${context.match.status === "completed" ? `Final Score: ${context.match.score}` : "Status: Upcoming"}
${context.match.xg ? `xG: ${context.match.xg}` : ""}

${context.prediction ? `Model Prediction: Home ${context.prediction.homeWin}, Draw ${context.prediction.draw}, Away ${context.prediction.awayWin}
Expected Goals: ${context.prediction.expectedGoals}
Over/Under 2.5: ${context.prediction.overUnder25}
Model Confidence: ${context.prediction.confidence}` : "No prediction data available."}

${context.odds ? `Odds: Home ${context.odds.home}, Draw ${context.odds.draw}, Away ${context.odds.away}` : ""}

${context.homeRecentForm?.length ? `${context.match.homeTeam} recent form: ${context.homeRecentForm.join(", ")}` : ""}
${context.awayRecentForm?.length ? `${context.match.awayTeam} recent form: ${context.awayRecentForm.join(", ")}` : ""}

Provide a concise analysis (3-5 paragraphs) covering:
1. Key factors that will influence the outcome
2. Team form and momentum analysis
3. Tactical considerations
4. Your prediction with reasoning
5. Value bets if odds are available

Keep it professional, data-driven, and insightful. Do NOT use markdown headers or bullet points — write flowing paragraphs.`;

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not set");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI API error: ${aiResponse.status} ${errText}`);
    }

    const aiData = await aiResponse.json();
    const insights = aiData.choices?.[0]?.message?.content || "Unable to generate insights.";

    // Save to matches table
    await supabase
      .from("matches")
      .update({ ai_insights: insights })
      .eq("id", match_id);

    return new Response(JSON.stringify({ success: true, insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("AI prediction error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
