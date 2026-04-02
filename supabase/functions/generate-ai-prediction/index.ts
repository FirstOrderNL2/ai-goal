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

// ── Poisson distribution helper ──
function poissonPMF(lambda: number, k: number): number {
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) {
    result *= lambda / i;
  }
  return result;
}

// ── Statistical pre-computation layer ──
function computeStatisticalAnchors(
  homeStats: { avgScored: string; avgConceded: string; cleanSheets: number; played: number; bttsRate: number } | null,
  awayStats: { avgScored: string; avgConceded: string; cleanSheets: number; played: number; bttsRate: number } | null,
  odds: { home_win_odds: number; draw_odds: number; away_win_odds: number } | null
) {
  const result: any = {};

  // Poisson-based expected goals
  if (homeStats && awayStats) {
    const homeAvgScored = parseFloat(homeStats.avgScored);
    const homeAvgConceded = parseFloat(homeStats.avgConceded);
    const awayAvgScored = parseFloat(awayStats.avgScored);
    const awayAvgConceded = parseFloat(awayStats.avgConceded);

    // League average goals (approximate)
    const leagueAvg = 1.35;

    // Poisson xG: attack strength × defense weakness × league average
    const homeAttackStrength = homeAvgScored / leagueAvg;
    const awayDefenseWeakness = awayAvgConceded / leagueAvg;
    const awayAttackStrength = awayAvgScored / leagueAvg;
    const homeDefenseWeakness = homeAvgConceded / leagueAvg;

    result.poisson_xg_home = Math.round(homeAttackStrength * awayDefenseWeakness * leagueAvg * 100) / 100;
    result.poisson_xg_away = Math.round(awayAttackStrength * homeDefenseWeakness * leagueAvg * 100) / 100;

    // Poisson match outcome probabilities
    let poissonHomeWin = 0, poissonDraw = 0, poissonAwayWin = 0, poissonOver25 = 0;
    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        const prob = poissonPMF(result.poisson_xg_home, h) * poissonPMF(result.poisson_xg_away, a);
        if (h > a) poissonHomeWin += prob;
        else if (h === a) poissonDraw += prob;
        else poissonAwayWin += prob;
        if (h + a > 2) poissonOver25 += prob;
      }
    }

    result.poisson_home_win = Math.round(poissonHomeWin * 1000) / 1000;
    result.poisson_draw = Math.round(poissonDraw * 1000) / 1000;
    result.poisson_away_win = Math.round(poissonAwayWin * 1000) / 1000;
    result.poisson_over_25 = Math.round(poissonOver25 * 1000) / 1000;

    // BTTS probability from scoring/conceding rates
    const homeScoringRate = homeAvgScored > 0 ? 1 - poissonPMF(homeAvgScored, 0) : 0.5;
    const awayScoringRate = awayAvgScored > 0 ? 1 - poissonPMF(awayAvgScored, 0) : 0.5;
    result.poisson_btts = Math.round(homeScoringRate * awayScoringRate * 1000) / 1000;
  }

  // Implied probabilities from odds
  if (odds) {
    const hw = 1 / odds.home_win_odds;
    const dr = 1 / odds.draw_odds;
    const aw = 1 / odds.away_win_odds;
    const total = hw + dr + aw;
    result.implied_home_win = Math.round((hw / total) * 1000) / 1000;
    result.implied_draw = Math.round((dr / total) * 1000) / 1000;
    result.implied_away_win = Math.round((aw / total) * 1000) / 1000;
    result.market_margin = Math.round((total - 1) * 1000) / 1000;
  }

  return result;
}

// ── Data quality confidence score ──
function computeDataQualityConfidence(
  formMatches: number, hasOdds: boolean, hasH2H: boolean,
  hasInjuries: boolean, hasStats: boolean
): number {
  return (
    0.25 * Math.min(formMatches / 5, 1) +
    0.20 * (hasOdds ? 1 : 0) +
    0.20 * (hasH2H ? 1 : 0) +
    0.15 * (hasInjuries ? 1 : 0) +
    0.20 * (hasStats ? 1 : 0)
  );
}

// ── Prediction validation ──
function validatePrediction(pred: any): string[] {
  const warnings: string[] = [];
  const totalScore = (pred.predicted_score_home ?? 0) + (pred.predicted_score_away ?? 0);

  // Over/under consistency
  if (pred.over_under_25 === "over" && totalScore <= 2) {
    warnings.push(`Inconsistency: predicted score ${pred.predicted_score_home}-${pred.predicted_score_away} (${totalScore} goals) but verdict is "over 2.5"`);
  }
  if (pred.over_under_25 === "under" && totalScore > 2) {
    warnings.push(`Inconsistency: predicted score ${pred.predicted_score_home}-${pred.predicted_score_away} (${totalScore} goals) but verdict is "under 2.5"`);
  }

  // BTTS consistency
  if (pred.btts === "yes" && (pred.predicted_score_home === 0 || pred.predicted_score_away === 0)) {
    warnings.push(`Inconsistency: BTTS "yes" but predicted score has a team at 0 goals`);
  }
  if (pred.btts === "no" && pred.predicted_score_home > 0 && pred.predicted_score_away > 0) {
    warnings.push(`Inconsistency: BTTS "no" but both teams predicted to score`);
  }

  return warnings;
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
      { data: matchContext },
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
      supabase.from("match_context")
        .select("injuries_home, injuries_away, lineup_home, lineup_away, suspensions, weather, news_items")
        .eq("match_id", match_id)
        .single(),
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

    // ── Statistical pre-computation ──
    const statsAnchors = computeStatisticalAnchors(homeStats, awayStats, odds);

    let statsAnchorsBlock = "";
    if (statsAnchors.poisson_xg_home != null) {
      statsAnchorsBlock += `\nSTATISTICAL MODEL (Poisson):
Poisson xG: ${homeName} ${statsAnchors.poisson_xg_home} - ${statsAnchors.poisson_xg_away} ${awayName}
Poisson probabilities: Home ${Math.round(statsAnchors.poisson_home_win * 100)}%, Draw ${Math.round(statsAnchors.poisson_draw * 100)}%, Away ${Math.round(statsAnchors.poisson_away_win * 100)}%
Poisson Over 2.5: ${Math.round(statsAnchors.poisson_over_25 * 100)}%
Poisson BTTS: ${Math.round(statsAnchors.poisson_btts * 100)}%`;
    }
    if (statsAnchors.implied_home_win != null) {
      statsAnchorsBlock += `\nMARKET IMPLIED PROBABILITIES (from odds):
Home ${Math.round(statsAnchors.implied_home_win * 100)}%, Draw ${Math.round(statsAnchors.implied_draw * 100)}%, Away ${Math.round(statsAnchors.implied_away_win * 100)}%
Market margin: ${Math.round(statsAnchors.market_margin * 100)}%`;
    }

    // Match context structured data
    let contextBlock = "";
    if (matchContext?.data) {
      const ctx = matchContext.data;
      if (ctx.injuries_home?.length > 0) {
        contextBlock += `\n${homeName} INJURIES: ${ctx.injuries_home.map((i: any) => `${i.player} (${i.reason})`).join(", ")}`;
      }
      if (ctx.injuries_away?.length > 0) {
        contextBlock += `\n${awayName} INJURIES: ${ctx.injuries_away.map((i: any) => `${i.player} (${i.reason})`).join(", ")}`;
      }
      if (ctx.suspensions?.length > 0) {
        contextBlock += `\nSUSPENSIONS: ${ctx.suspensions.map((s: any) => `${s.player} (${s.team})`).join(", ")}`;
      }
      if (ctx.weather) {
        contextBlock += `\nWEATHER: ${ctx.weather}`;
      }
    }

    // Data quality confidence
    const hasInjuryData = (matchContext?.data?.injuries_home?.length > 0 || matchContext?.data?.injuries_away?.length > 0);
    const dataQuality = computeDataQualityConfidence(
      homeFormStr.length, !!odds, h2hMatches != null && h2hMatches.length > 0,
      hasInjuryData, homeStats != null && awayStats != null
    );

    // Learning context
    let learningBlock = "";
    if (pastReviews && pastReviews.length > 0) {
      const avgScore = pastReviews.reduce((s: number, r: any) => s + (Number(r.ai_accuracy_score) || 0), 0) / pastReviews.length;
      const relevantReviews = pastReviews.filter(
        (r: any) =>
          r.team_home_id === match.team_home_id || r.team_away_id === match.team_away_id ||
          r.team_home_id === match.team_away_id || r.team_away_id === match.team_home_id
      );
      learningBlock = `\n\nLEARNING FROM PAST PREDICTIONS:
Your recent average accuracy: ${Math.round(avgScore)}/100 across ${pastReviews.length} reviewed matches.
${relevantReviews.length > 0
        ? `Relevant past reviews:\n${relevantReviews.map((r: any) => `- ${(r as any).home_team?.name} vs ${(r as any).away_team?.name} (score: ${r.ai_accuracy_score}/100): ${r.ai_post_match_review?.slice(0, 300)}...`).join("\n")}`
        : `Recent reviews:\n${pastReviews.slice(0, 3).map((r: any) => `- ${(r as any).home_team?.name} vs ${(r as any).away_team?.name} (score: ${r.ai_accuracy_score}/100): ${r.ai_post_match_review?.slice(0, 200)}...`).join("\n")}`
      }
Apply the lessons above. Avoid repeating the same mistakes.`;
    }

    const systemPrompt = `You are a world-class football analyst and prediction engine. Your job is to analyze match data and produce ACCURATE, FACT-BASED predictions.

CRITICAL RULES:
1. Every prediction MUST be justified with specific statistics from the data provided
2. Use the STATISTICAL MODEL (Poisson) probabilities as your mathematical anchor — deviate only with clear justification (injuries, form, contextual factors)
3. Compare your prediction against MARKET IMPLIED PROBABILITIES — note where you agree and disagree with the market
4. Predicted scoreline must be derived from actual goal-scoring averages (e.g. "Home averages 1.8 goals → predict 2 home goals")
5. BTTS must be justified by both teams' scoring/conceding rates (e.g. "Home scored in 9/10, Away conceded in 8/10 → BTTS Yes")
6. Over/Under must reference combined goal averages and Poisson probability (e.g. "Poisson Over 2.5: 65%, Combined avg 3.1 goals per game → Over 2.5")
7. Winner prediction must cite form, H2H, home advantage, and key absences
8. Use injuries/suspensions/lineup data to adjust predictions when available
9. Be honest about uncertainty — lower confidence when data is sparse
10. Your predicted score MUST be consistent with your BTTS and Over/Under verdicts

DATA QUALITY NOTE: This prediction has a data quality score of ${Math.round(dataQuality * 100)}%. ${dataQuality < 0.5 ? "Data is limited — be more conservative and express higher uncertainty." : "Good data coverage — you can be more decisive."}

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
${statsAnchorsBlock}

${homeFormStr.length ? `${homeName} overall form: ${homeFormStr.join(", ")}` : ""}
${awayFormStr.length ? `${awayName} overall form: ${awayFormStr.join(", ")}` : ""}
${homeHomeForm.length ? `${homeName} HOME form: ${homeHomeForm.join(", ")}` : ""}
${awayAwayForm.length ? `${awayName} AWAY form: ${awayAwayForm.join(", ")}` : ""}
${h2hBlock}
${statsBlock}
${contextBlock}
${liveContext ? `\nLIVE CONTEXT (injuries, suspensions, lineups, news):\n${liveContext}` : ""}
${learningBlock}

IMPORTANT: 
1. Your reasoning must cite SPECIFIC numbers from the data above. Every claim must reference a stat.
2. Use the Poisson model as your starting point, then adjust based on context.
3. Note any disagreement with market odds and explain why.
4. Ensure predicted score is CONSISTENT with BTTS and Over/Under verdicts.`;

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
                confidence: { type: "number", description: "Confidence 0-1 based on data quality and model agreement" },
                winner_reasoning: { type: "string", description: "2-3 bullet points citing specific stats for why this team wins/draws. Each point MUST reference a number. Include Poisson vs market comparison." },
                btts_reasoning: { type: "string", description: "1-2 bullet points with specific scoring/conceding rates justifying BTTS verdict. Reference Poisson BTTS probability." },
                over_under_reasoning: { type: "string", description: "1-2 bullet points with combined goal averages and Poisson Over 2.5 probability justifying verdict." },
                key_factors: { type: "string", description: "2-3 bullet points about injuries, suspensions, tactical factors, market value disagreements, or other match-specific context that influenced the prediction." },
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
      const textContent = aiData.choices?.[0]?.message?.content || "Unable to generate insights.";
      await supabase.from("matches").update({ ai_insights: textContent }).eq("id", match_id);
      return new Response(JSON.stringify({ success: true, insights: textContent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pred = JSON.parse(toolCall.function.arguments);

    // ── Validation ──
    const warnings = validatePrediction(pred);
    if (warnings.length > 0) {
      console.warn("Prediction validation warnings:", warnings);
      // Auto-fix: align over_under and btts with predicted score
      const totalScore = (pred.predicted_score_home ?? 0) + (pred.predicted_score_away ?? 0);
      pred.over_under_25 = totalScore > 2 ? "over" : "under";
      pred.btts = (pred.predicted_score_home > 0 && pred.predicted_score_away > 0) ? "yes" : "no";
    }

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

    // Use data quality as floor for confidence, blend with AI's confidence
    const aiConfidence = pred.confidence || 0.5;
    const blendedConfidence = Math.round(((aiConfidence * 0.6) + (dataQuality * 0.4)) * 1000) / 1000;

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
      model_confidence: blendedConfidence,
      ai_reasoning: reasoning,
    }, { onConflict: "match_id" });

    // Also store reasoning as ai_insights on the match
    await supabase.from("matches").update({ ai_insights: reasoning }).eq("id", match_id);

    return new Response(JSON.stringify({
      success: true,
      insights: reasoning,
      prediction: pred,
      statistical_anchors: statsAnchors,
      data_quality: Math.round(dataQuality * 100),
      validation_warnings: warnings,
    }), {
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
