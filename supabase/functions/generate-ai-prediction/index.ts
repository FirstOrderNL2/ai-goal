import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchMatchContext(
  homeName: string, awayName: string, league: string, matchDate: string,
  supabaseUrl: string, serviceKey: string,
  apiFootballId?: number | null, homeTeamApiId?: number | null, awayTeamApiId?: number | null
): Promise<string> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/fetch-match-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        home_team: homeName, away_team: awayName, league, match_date: matchDate,
        api_football_id: apiFootballId ?? undefined,
        home_team_api_id: homeTeamApiId ?? undefined,
        away_team_api_id: awayTeamApiId ?? undefined,
      }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data.context || "";
  } catch (e) {
    console.error("Failed to fetch match context:", e);
    return "";
  }
}

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

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

    // Fetch prediction, odds, form, past reviews in parallel
    const [{ data: prediction }, { data: odds }, { data: homeForm }, { data: awayForm }, { data: pastReviews }] = await Promise.all([
      supabase.from("predictions").select("*").eq("match_id", match_id).single(),
      supabase.from("odds").select("*").eq("match_id", match_id).single(),
      supabase
        .from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id, status, xg_home, xg_away")
        .or(`team_home_id.eq.${match.team_home_id},team_away_id.eq.${match.team_home_id}`)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(5),
      supabase
        .from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id, status, xg_home, xg_away")
        .or(`team_home_id.eq.${match.team_away_id},team_away_id.eq.${match.team_away_id}`)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(5),
      supabase
        .from("matches")
        .select("ai_post_match_review, ai_accuracy_score, team_home_id, team_away_id, league, home_team:teams!matches_team_home_id_fkey(name), away_team:teams!matches_team_away_id_fkey(name)")
        .not("ai_post_match_review", "is", null)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(10),
    ]);

    const homeName = match.home_team?.name ?? "Home";
    const awayName = match.away_team?.name ?? "Away";

    // Fetch live web context (injuries, lineups, news)
    const liveContext = await fetchMatchContext(homeName, awayName, match.league, match.match_date, supabaseUrl, serviceKey);

    // Build learning context from past reviews
    let learningBlock = "";
    if (pastReviews && pastReviews.length > 0) {
      const avgScore = pastReviews.reduce((s, r) => s + (Number(r.ai_accuracy_score) || 0), 0) / pastReviews.length;
      const relevantReviews = pastReviews.filter(
        (r) =>
          r.team_home_id === match.team_home_id ||
          r.team_away_id === match.team_away_id ||
          r.team_home_id === match.team_away_id ||
          r.team_away_id === match.team_home_id
      );

      learningBlock = `\n\nLEARNING FROM PAST PREDICTIONS (use these lessons to improve this prediction):
Your recent average accuracy score: ${Math.round(avgScore)}/100 across ${pastReviews.length} reviewed matches.
${relevantReviews.length > 0
        ? `\nRelevant past reviews involving these teams:\n${relevantReviews
            .map((r) => `- ${(r as any).home_team?.name ?? "?"} vs ${(r as any).away_team?.name ?? "?"} (score: ${r.ai_accuracy_score}/100): ${r.ai_post_match_review?.slice(0, 300)}...`)
            .join("\n")}`
        : `\nRecent reviews (other matches):\n${pastReviews
            .slice(0, 3)
            .map((r) => `- ${(r as any).home_team?.name ?? "?"} vs ${(r as any).away_team?.name ?? "?"} (score: ${r.ai_accuracy_score}/100): ${r.ai_post_match_review?.slice(0, 200)}...`)
            .join("\n")}`
      }

Apply the lessons above. Avoid repeating the same mistakes.`;
    }

    const homeFormStr = homeForm?.map((m: any) => {
      const isHome = m.team_home_id === match.team_home_id;
      const gf = isHome ? m.goals_home : m.goals_away;
      const ga = isHome ? m.goals_away : m.goals_home;
      const r = gf! > ga! ? "W" : gf === ga ? "D" : "L";
      return `${r} (${gf}-${ga})`;
    }) ?? [];

    const awayFormStr = awayForm?.map((m: any) => {
      const isHome = m.team_home_id === match.team_away_id;
      const gf = isHome ? m.goals_home : m.goals_away;
      const ga = isHome ? m.goals_away : m.goals_home;
      const r = gf! > ga! ? "W" : gf === ga ? "D" : "L";
      return `${r} (${gf}-${ga})`;
    }) ?? [];

    const prompt = `You are an expert football analyst. Analyze this match and provide detailed insights.

Match: ${homeName} vs ${awayName}
League: ${match.league}
Date: ${match.match_date}
${match.status === "completed" ? `Final Score: ${match.goals_home}-${match.goals_away}` : "Status: Upcoming"}
${match.xg_home != null ? `xG: ${match.xg_home}-${match.xg_away}` : ""}

${prediction ? `Model Prediction: Home ${Math.round(prediction.home_win * 100)}%, Draw ${Math.round(prediction.draw * 100)}%, Away ${Math.round(prediction.away_win * 100)}%
Expected Goals: ${prediction.expected_goals_home}-${prediction.expected_goals_away}
Over/Under 2.5: ${prediction.over_under_25}
Model Confidence: ${Math.round(prediction.model_confidence * 100)}%` : "No prediction data available."}

${odds ? `Odds: Home ${odds.home_win_odds}, Draw ${odds.draw_odds}, Away ${odds.away_win_odds}` : ""}

${homeFormStr.length ? `${homeName} recent form: ${homeFormStr.join(", ")}` : ""}
${awayFormStr.length ? `${awayName} recent form: ${awayFormStr.join(", ")}` : ""}
${liveContext ? `\nLIVE MATCH CONTEXT (injuries, suspensions, lineups, team news from the web):\n${liveContext}` : ""}
${learningBlock}

Provide a concise analysis (3-5 paragraphs) covering:
1. Key factors that will influence the outcome (including injuries and suspensions if known)
2. Team form and momentum analysis
3. Tactical considerations and expected lineups
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
        max_tokens: 1200,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errText = await aiResponse.text();
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI API error: ${status} ${errText}`);
    }

    const aiData = await aiResponse.json();
    const insights = aiData.choices?.[0]?.message?.content || "Unable to generate insights.";

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
