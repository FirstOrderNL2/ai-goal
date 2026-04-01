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

    // Fetch prediction, odds, form, H2H, past reviews in parallel
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
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .eq("team_home_id", match.team_home_id)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(5),
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .eq("team_away_id", match.team_away_id)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(5),
      supabase.from("matches")
        .select("goals_home, goals_away, match_date, team_home_id, team_away_id, home_team:teams!matches_team_home_id_fkey(name), away_team:teams!matches_team_away_id_fkey(name)")
        .or(`and(team_home_id.eq.${match.team_home_id},team_away_id.eq.${match.team_away_id}),and(team_home_id.eq.${match.team_away_id},team_away_id.eq.${match.team_home_id})`)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(5),
      supabase.from("matches")
        .select("ai_post_match_review, ai_accuracy_score, team_home_id, team_away_id, league, home_team:teams!matches_team_home_id_fkey(name), away_team:teams!matches_team_away_id_fkey(name)")
        .not("ai_post_match_review", "is", null)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(10),
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .or(`team_home_id.eq.${match.team_home_id},team_away_id.eq.${match.team_home_id}`)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(20),
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .or(`team_home_id.eq.${match.team_away_id},team_away_id.eq.${match.team_away_id}`)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(20),
    ]);

    const homeName = match.home_team?.name ?? "Home";
    const awayName = match.away_team?.name ?? "Away";

    // Fetch live web context
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
      let scored = 0, conceded = 0, cleanSheets = 0, bttsCount = 0;
      for (const m of matches) {
        const isHome = m.team_home_id === teamId;
        const gf = isHome ? (m.goals_home ?? 0) : (m.goals_away ?? 0);
        const ga = isHome ? (m.goals_away ?? 0) : (m.goals_home ?? 0);
        scored += gf;
        conceded += ga;
        if (ga === 0) cleanSheets++;
        if (gf > 0 && ga > 0) bttsCount++;
      }
      return {
        played: matches.length,
        avgScored: (scored / matches.length).toFixed(1),
        avgConceded: (conceded / matches.length).toFixed(1),
        cleanSheets,
        bttsRate: Math.round((bttsCount / matches.length) * 100),
      };
    }

    const homeStats = calcStats(homeAllMatches || [], match.team_home_id);
    const awayStats = calcStats(awayAllMatches || [], match.team_away_id);

    let statsBlock = "";
    if (homeStats) {
      statsBlock += `\n${homeName} stats (last ${homeStats.played}): avg scored ${homeStats.avgScored}, avg conceded ${homeStats.avgConceded}, clean sheets ${homeStats.cleanSheets}, BTTS rate ${homeStats.bttsRate}%`;
    }
    if (awayStats) {
      statsBlock += `\n${awayName} stats (last ${awayStats.played}): avg scored ${awayStats.avgScored}, avg conceded ${awayStats.avgConceded}, clean sheets ${awayStats.cleanSheets}, BTTS rate ${awayStats.bttsRate}%`;
    }

    // Learning context
    let learningBlock = "";
    if (pastReviews && pastReviews.length > 0) {
      const avgScore = pastReviews.reduce((s, r) => s + (Number(r.ai_accuracy_score) || 0), 0) / pastReviews.length;
      const relevantReviews = pastReviews.filter(
        (r) =>
          r.team_home_id === match.team_home_id || r.team_away_id === match.team_away_id ||
          r.team_home_id === match.team_away_id || r.team_away_id === match.team_home_id
      );
      learningBlock = `\n\nLEARNING FROM PAST PREDICTIONS:
Your recent average accuracy: ${Math.round(avgScore)}/100 across ${pastReviews.length} reviewed matches.
${relevantReviews.length > 0
        ? `Relevant past reviews:\n${relevantReviews.map((r) => `- ${(r as any).home_team?.name} vs ${(r as any).away_team?.name} (score: ${r.ai_accuracy_score}/100): ${r.ai_post_match_review?.slice(0, 300)}...`).join("\n")}`
        : `Recent reviews:\n${pastReviews.slice(0, 3).map((r) => `- ${(r as any).home_team?.name} vs ${(r as any).away_team?.name} (score: ${r.ai_accuracy_score}/100): ${r.ai_post_match_review?.slice(0, 200)}...`).join("\n")}`
      }
Apply the lessons above. Avoid repeating the same mistakes.`;
    }

    const systemPrompt = `You are a world-class football analyst and prediction engine. Your job is to analyze match data and produce ACCURATE, FACT-BASED predictions.

CRITICAL RULES:
1. Every prediction MUST be justified with specific statistics from the data provided
2. Predicted scoreline must be derived from actual goal-scoring averages (e.g. "Home averages 1.8 goals → predict 2 home goals")
3. BTTS must be justified by both teams' scoring/conceding rates (e.g. "Home scored in 9/10, Away conceded in 8/10 → BTTS Yes")
4. Over/Under must reference combined goal averages (e.g. "Combined avg 3.1 goals per game → Over 2.5")
5. Winner prediction must cite form, H2H, home advantage, and key absences
6. Use injuries/suspensions/lineup data to adjust predictions when available
7. Be honest about uncertainty — lower confidence when data is sparse

You must call the predict_match tool with your structured analysis.`;

    const userPrompt = `Analyze this match and call predict_match with your prediction.

Match: ${homeName} vs ${awayName}
League: ${match.league}
Date: ${match.match_date}
${match.status === "completed" ? `Final Score: ${match.goals_home}-${match.goals_away}` : "Status: Upcoming"}
${match.xg_home != null ? `xG: ${match.xg_home}-${match.xg_away}` : ""}

${prediction ? `Existing Model: Home ${Math.round(prediction.home_win * 100)}%, Draw ${Math.round(prediction.draw * 100)}%, Away ${Math.round(prediction.away_win * 100)}%
xG: ${prediction.expected_goals_home}-${prediction.expected_goals_away}, O/U 2.5: ${prediction.over_under_25}, Confidence: ${Math.round(prediction.model_confidence * 100)}%` : "No existing prediction."}

${odds ? `Odds: Home ${odds.home_win_odds}, Draw ${odds.draw_odds}, Away ${odds.away_win_odds}` : ""}

${homeFormStr.length ? `${homeName} overall form: ${homeFormStr.join(", ")}` : ""}
${awayFormStr.length ? `${awayName} overall form: ${awayFormStr.join(", ")}` : ""}
${homeHomeForm.length ? `${homeName} HOME form: ${homeHomeForm.join(", ")}` : ""}
${awayAwayForm.length ? `${awayName} AWAY form: ${awayAwayForm.join(", ")}` : ""}
${h2hBlock}
${statsBlock}
${liveContext ? `\nLIVE CONTEXT (injuries, suspensions, lineups, news):\n${liveContext}` : ""}
${learningBlock}

IMPORTANT: Your reasoning must cite SPECIFIC numbers from the data above. Every claim must reference a stat.`;

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
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        reasoning: { effort: "high" },
        max_tokens: 4000,
        tools: [{
          type: "function",
          function: {
            name: "predict_match",
            description: "Submit structured match prediction with fact-based reasoning",
            parameters: {
              type: "object",
              properties: {
                home_win: { type: "number", description: "Home win probability 0-1" },
                draw: { type: "number", description: "Draw probability 0-1" },
                away_win: { type: "number", description: "Away win probability 0-1" },
                expected_goals_home: { type: "number", description: "Expected goals home (e.g. 1.4)" },
                expected_goals_away: { type: "number", description: "Expected goals away (e.g. 1.1)" },
                predicted_score_home: { type: "integer", description: "Predicted exact goals for home team" },
                predicted_score_away: { type: "integer", description: "Predicted exact goals for away team" },
                over_under_25: { type: "string", enum: ["over", "under"], description: "Over or under 2.5 total goals" },
                btts: { type: "string", enum: ["yes", "no"], description: "Both teams to score" },
                confidence: { type: "number", description: "Confidence 0-1 based on data quality" },
                winner_reasoning: { type: "string", description: "2-3 bullet points citing specific stats for why this team wins/draws. Each point MUST reference a number." },
                btts_reasoning: { type: "string", description: "1-2 bullet points with specific scoring/conceding rates justifying BTTS verdict." },
                over_under_reasoning: { type: "string", description: "1-2 bullet points with combined goal averages justifying over/under verdict." },
                key_factors: { type: "string", description: "2-3 bullet points about injuries, suspensions, tactical factors, or other match-specific context that influenced the prediction." },
              },
              required: [
                "home_win", "draw", "away_win", "expected_goals_home", "expected_goals_away",
                "predicted_score_home", "predicted_score_away", "over_under_25", "btts",
                "confidence", "winner_reasoning", "btts_reasoning", "over_under_reasoning", "key_factors"
              ],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "predict_match" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errText = await aiResponse.text();
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI API error: ${status} ${errText}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      // Fallback: use text content as insights
      const textContent = aiData.choices?.[0]?.message?.content || "Unable to generate insights.";
      await supabase.from("matches").update({ ai_insights: textContent }).eq("id", match_id);
      return new Response(JSON.stringify({ success: true, insights: textContent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pred = JSON.parse(toolCall.function.arguments);

    // Normalize probabilities
    const total = (pred.home_win || 0) + (pred.draw || 0) + (pred.away_win || 0);
    const hw = total > 0 ? pred.home_win / total : 0.4;
    const dr = total > 0 ? pred.draw / total : 0.3;
    const aw = total > 0 ? pred.away_win / total : 0.3;

    // Build structured reasoning text
    const reasoning = [
      `🏆 WINNER ANALYSIS:`,
      pred.winner_reasoning || "",
      ``,
      `⚽ BTTS (${(pred.btts || "no").toUpperCase()}):`,
      pred.btts_reasoning || "",
      ``,
      `📊 OVER/UNDER 2.5 (${(pred.over_under_25 || "under").toUpperCase()}):`,
      pred.over_under_reasoning || "",
      ``,
      `🔑 KEY FACTORS:`,
      pred.key_factors || "",
    ].join("\n");

    // Upsert prediction with new structured fields
    await supabase.from("predictions").upsert({
      match_id: match_id,
      home_win: Math.round(hw * 1000) / 1000,
      draw: Math.round(dr * 1000) / 1000,
      away_win: Math.round(aw * 1000) / 1000,
      expected_goals_home: Math.round((pred.expected_goals_home || 1.2) * 10) / 10,
      expected_goals_away: Math.round((pred.expected_goals_away || 1.0) * 10) / 10,
      predicted_score_home: pred.predicted_score_home ?? null,
      predicted_score_away: pred.predicted_score_away ?? null,
      over_under_25: pred.over_under_25 || "under",
      btts: pred.btts || "no",
      model_confidence: Math.round((pred.confidence || 0.5) * 1000) / 1000,
      ai_reasoning: reasoning,
    }, { onConflict: "match_id" });

    // Also store reasoning as ai_insights on the match
    await supabase.from("matches").update({ ai_insights: reasoning }).eq("id", match_id);

    return new Response(JSON.stringify({ success: true, insights: reasoning, prediction: pred }), {
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
