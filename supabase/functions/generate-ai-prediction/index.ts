import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchMatchContext(
  homeName: string, awayName: string, league: string, matchDate: string,
  supabaseUrl: string, serviceKey: string,
  apiFootballId?: number | null, homeTeamApiId?: number | null, awayTeamApiId?: number | null,
  matchId?: string
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
        match_id: matchId,
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

function buildFormString(matches: any[], teamId: string, isHome: boolean): string[] {
  return (matches || [])
    .filter((m: any) => isHome ? m.team_home_id === teamId : m.team_away_id === teamId)
    .slice(0, 5)
    .map((m: any) => {
      const gf = isHome ? m.goals_home : m.goals_away;
      const ga = isHome ? m.goals_away : m.goals_home;
      const r = gf! > ga! ? "W" : gf === ga ? "D" : "L";
      return `${r} (${gf}-${ga})`;
    });
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

    // Fetch prediction, odds, form (overall + home/away splits), H2H, past reviews in parallel
    const [
      { data: prediction },
      { data: odds },
      { data: homeFormAll },
      { data: awayFormAll },
      { data: homeFormHome },
      { data: awayFormAway },
      { data: h2hMatches },
      { data: pastReviews },
      { data: homeAllMatches },
      { data: awayAllMatches },
    ] = await Promise.all([
      supabase.from("predictions").select("*").eq("match_id", match_id).single(),
      supabase.from("odds").select("*").eq("match_id", match_id).single(),
      // Overall form (last 5)
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id, status, xg_home, xg_away")
        .or(`team_home_id.eq.${match.team_home_id},team_away_id.eq.${match.team_home_id}`)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(5),
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id, status, xg_home, xg_away")
        .or(`team_home_id.eq.${match.team_away_id},team_away_id.eq.${match.team_away_id}`)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(5),
      // Home-only form for home team
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .eq("team_home_id", match.team_home_id)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(5),
      // Away-only form for away team
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .eq("team_away_id", match.team_away_id)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(5),
      // Head-to-head: last 5 meetings
      supabase.from("matches")
        .select("goals_home, goals_away, match_date, team_home_id, team_away_id, home_team:teams!matches_team_home_id_fkey(name), away_team:teams!matches_team_away_id_fkey(name)")
        .or(`and(team_home_id.eq.${match.team_home_id},team_away_id.eq.${match.team_away_id}),and(team_home_id.eq.${match.team_away_id},team_away_id.eq.${match.team_home_id})`)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(5),
      // Past reviews for learning
      supabase.from("matches")
        .select("ai_post_match_review, ai_accuracy_score, team_home_id, team_away_id, league, home_team:teams!matches_team_home_id_fkey(name), away_team:teams!matches_team_away_id_fkey(name)")
        .not("ai_post_match_review", "is", null)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(10),
      // All completed matches for home team (stats calc)
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .or(`team_home_id.eq.${match.team_home_id},team_away_id.eq.${match.team_home_id}`)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(20),
      // All completed matches for away team (stats calc)
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .or(`team_home_id.eq.${match.team_away_id},team_away_id.eq.${match.team_away_id}`)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(20),
    ]);

    const homeName = match.home_team?.name ?? "Home";
    const awayName = match.away_team?.name ?? "Away";

    // Fetch live web context (injuries, lineups, news)
    const liveContext = await fetchMatchContext(
      homeName, awayName, match.league, match.match_date, supabaseUrl, serviceKey,
      match.api_football_id, match.home_team?.api_football_id, match.away_team?.api_football_id,
      match_id
    );

    // Build form strings
    const homeFormStr = (homeFormAll || []).map((m: any) => {
      const isHome = m.team_home_id === match.team_home_id;
      const gf = isHome ? m.goals_home : m.goals_away;
      const ga = isHome ? m.goals_away : m.goals_home;
      const r = gf! > ga! ? "W" : gf === ga ? "D" : "L";
      return `${r} (${gf}-${ga})`;
    });

    const awayFormStr = (awayFormAll || []).map((m: any) => {
      const isHome = m.team_home_id === match.team_away_id;
      const gf = isHome ? m.goals_home : m.goals_away;
      const ga = isHome ? m.goals_away : m.goals_home;
      const r = gf! > ga! ? "W" : gf === ga ? "D" : "L";
      return `${r} (${gf}-${ga})`;
    });

    // Home/away split form
    const homeHomeForm = buildFormString(homeFormHome || [], match.team_home_id, true);
    const awayAwayForm = buildFormString(awayFormAway || [], match.team_away_id, false);

    // H2H summary
    let h2hBlock = "";
    if (h2hMatches && h2hMatches.length > 0) {
      const h2hLines = h2hMatches.map((m: any) => {
        const hName = (m as any).home_team?.name ?? "?";
        const aName = (m as any).away_team?.name ?? "?";
        return `${m.match_date?.slice(0, 10)}: ${hName} ${m.goals_home}-${m.goals_away} ${aName}`;
      });
      h2hBlock = `\nHEAD-TO-HEAD (last ${h2hMatches.length} meetings):\n${h2hLines.join("\n")}`;
    }

    // Goal-scoring stats
    function calcStats(matches: any[], teamId: string) {
      if (!matches || matches.length === 0) return null;
      let scored = 0, conceded = 0, cleanSheets = 0;
      for (const m of matches) {
        const isHome = m.team_home_id === teamId;
        const gf = isHome ? (m.goals_home ?? 0) : (m.goals_away ?? 0);
        const ga = isHome ? (m.goals_away ?? 0) : (m.goals_home ?? 0);
        scored += gf;
        conceded += ga;
        if (ga === 0) cleanSheets++;
      }
      return {
        played: matches.length,
        avgScored: (scored / matches.length).toFixed(1),
        avgConceded: (conceded / matches.length).toFixed(1),
        cleanSheets,
      };
    }

    const homeStats = calcStats(homeAllMatches || [], match.team_home_id);
    const awayStats = calcStats(awayAllMatches || [], match.team_away_id);

    let statsBlock = "";
    if (homeStats) {
      statsBlock += `\n${homeName} stats (last ${homeStats.played}): avg scored ${homeStats.avgScored}, avg conceded ${homeStats.avgConceded}, clean sheets ${homeStats.cleanSheets}`;
    }
    if (awayStats) {
      statsBlock += `\n${awayName} stats (last ${awayStats.played}): avg scored ${awayStats.avgScored}, avg conceded ${awayStats.avgConceded}, clean sheets ${awayStats.cleanSheets}`;
    }

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

      learningBlock = `\n\nLEARNING FROM PAST PREDICTIONS:
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

${homeFormStr.length ? `${homeName} overall form: ${homeFormStr.join(", ")}` : ""}
${awayFormStr.length ? `${awayName} overall form: ${awayFormStr.join(", ")}` : ""}
${homeHomeForm.length ? `${homeName} HOME form: ${homeHomeForm.join(", ")}` : ""}
${awayAwayForm.length ? `${awayName} AWAY form: ${awayAwayForm.join(", ")}` : ""}
${h2hBlock}
${statsBlock}
${liveContext ? `\nLIVE MATCH CONTEXT (injuries, suspensions, lineups, team news from live web scraping):\n${liveContext}` : ""}
${learningBlock}

Provide a thorough analysis (4-6 paragraphs) covering:
1. Key factors that will influence the outcome (injuries, suspensions, missing key players)
2. Team form, momentum, and home/away performance split
3. Head-to-head history and what it suggests
4. Tactical considerations and expected lineups
5. Your prediction with specific scoreline, BTTS (both teams to score), and over/under 2.5
6. Value bets if odds are available

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
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
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
