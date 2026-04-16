import { createClient } from "npm:@supabase/supabase-js@2";

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s max
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
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return "";
    const data = await res.json();
    return data.context || "";
  } catch (e) {
    console.error("Failed to fetch match context (timeout or error):", e);
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

function poissonPMF(lambda: number, k: number): number {
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) {
    result *= lambda / i;
  }
  return result;
}

function computeGoalLines(lambdaHome: number, lambdaAway: number): Record<string, number> {
  const thresholds = [0.5, 1.5, 2.5, 3.5, 4.5];
  const result: Record<string, number> = {};
  for (const t of thresholds) {
    let probUnder = 0;
    const maxGoals = Math.ceil(t) - 1;
    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        const p = poissonPMF(lambdaHome, h) * poissonPMF(lambdaAway, a);
        if (h + a <= maxGoals) probUnder += p;
      }
    }
    const key = t.toString().replace(".", "_");
    result[`over_${key}`] = Math.round((1 - probUnder) * 1000) / 1000;
    result[`under_${key}`] = Math.round(probUnder * 1000) / 1000;
  }
  return result;
}

function computeGoalDistribution(lambdaHome: number, lambdaAway: number): Record<string, number> {
  const dist: Record<string, number> = {};
  for (let total = 0; total <= 6; total++) {
    let prob = 0;
    for (let h = 0; h <= total; h++) {
      const a = total - h;
      if (a <= 8) prob += poissonPMF(lambdaHome, h) * poissonPMF(lambdaAway, a);
    }
    dist[`total_${total}`] = Math.round(prob * 1000) / 1000;
  }
  return dist;
}

function findBestPick(
  goalLines: Record<string, number>,
  poissonHomeWin: number, poissonDraw: number, poissonAwayWin: number,
  impliedHome: number | null, impliedDraw: number | null, impliedAway: number | null,
  poissonBtts: number | null
): { pick: string; confidence: number; edge: number } {
  const candidates: { pick: string; confidence: number; edge: number }[] = [];

  // Goal line value picks
  for (const [k, v] of Object.entries(goalLines)) {
    if (v >= 0.55 && v <= 0.85) {
      const label = k.startsWith("over_")
        ? k.replace("over_", "Over ").replace("_", ".")
        : k.replace("under_", "Under ").replace("_", ".");
      candidates.push({ pick: label, confidence: v, edge: 0 });
    }
  }

  // 1X2 value picks (compare AI/Poisson vs market)
  if (impliedHome != null) {
    const homeEdge = poissonHomeWin - impliedHome;
    const drawEdge = poissonDraw - (impliedDraw || 0);
    const awayEdge = poissonAwayWin - (impliedAway || 0);

    if (homeEdge > 0.05 && poissonHomeWin >= 0.4) {
      candidates.push({ pick: "Home Win", confidence: poissonHomeWin, edge: homeEdge });
    }
    if (drawEdge > 0.05 && poissonDraw >= 0.25) {
      candidates.push({ pick: "Draw", confidence: poissonDraw, edge: drawEdge });
    }
    if (awayEdge > 0.05 && poissonAwayWin >= 0.3) {
      candidates.push({ pick: "Away Win", confidence: poissonAwayWin, edge: awayEdge });
    }
  }

  // BTTS value pick
  if (poissonBtts != null && poissonBtts >= 0.55 && poissonBtts <= 0.85) {
    candidates.push({ pick: "BTTS Yes", confidence: poissonBtts, edge: 0 });
  }

  // Sort by edge first, then confidence
  candidates.sort((a, b) => (b.edge || 0) - (a.edge || 0) || b.confidence - a.confidence);

  if (candidates.length > 0) {
    return candidates[0];
  }
  return {
    pick: goalLines.over_2_5 > 0.5 ? "Over 2.5" : "Under 2.5",
    confidence: Math.max(goalLines.over_2_5, goalLines.under_2_5),
    edge: 0,
  };
}

function computeStatisticalAnchors(
  homeStats: { avgScored: string; avgConceded: string; cleanSheets: number; played: number; bttsRate: number } | null,
  awayStats: { avgScored: string; avgConceded: string; cleanSheets: number; played: number; bttsRate: number } | null,
  odds: { home_win_odds: number; draw_odds: number; away_win_odds: number } | null,
  leagueHomeAvg: number, leagueAwayAvg: number
) {
  const result: any = {};

  if (homeStats && awayStats) {
    const homeAvgScored = parseFloat(homeStats.avgScored);
    const homeAvgConceded = parseFloat(homeStats.avgConceded);
    const awayAvgScored = parseFloat(awayStats.avgScored);
    const awayAvgConceded = parseFloat(awayStats.avgConceded);
    const leagueAvg = (leagueHomeAvg + leagueAwayAvg) / 2;

    const homeAttackStrength = homeAvgScored / leagueAvg;
    const awayDefenseWeakness = awayAvgConceded / leagueAvg;
    const awayAttackStrength = awayAvgScored / leagueAvg;
    const homeDefenseWeakness = homeAvgConceded / leagueAvg;

    // Home advantage: home team uses league home avg, away uses league away avg
    result.poisson_xg_home = Math.round(homeAttackStrength * awayDefenseWeakness * leagueHomeAvg * 100) / 100;
    result.poisson_xg_away = Math.round(awayAttackStrength * homeDefenseWeakness * leagueAwayAvg * 100) / 100;

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

    const homeScoringRate = homeAvgScored > 0 ? 1 - poissonPMF(homeAvgScored, 0) : 0.5;
    const awayScoringRate = awayAvgScored > 0 ? 1 - poissonPMF(awayAvgScored, 0) : 0.5;
    result.poisson_btts = Math.round(homeScoringRate * awayScoringRate * 1000) / 1000;
  }

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

function computeDataQualityConfidence(
  formMatches: number, hasOdds: boolean, hasH2H: boolean,
  hasInjuries: boolean, hasStats: boolean, hasPlayers: boolean, hasTeamStats: boolean,
  hasLineups: boolean
): number {
  return (
    0.18 * Math.min(formMatches / 5, 1) +
    0.14 * (hasOdds ? 1 : 0) +
    0.12 * (hasH2H ? 1 : 0) +
    0.10 * (hasInjuries ? 1 : 0) +
    0.14 * (hasStats ? 1 : 0) +
    0.08 * (hasPlayers ? 1 : 0) +
    0.12 * (hasTeamStats ? 1 : 0) +
    0.12 * (hasLineups ? 1 : 0)
  );
}

function validatePrediction(pred: any): string[] {
  const warnings: string[] = [];
  const totalScore = (pred.predicted_score_home ?? 0) + (pred.predicted_score_away ?? 0);

  if (pred.over_under_25 === "over" && totalScore <= 2) {
    warnings.push(`Inconsistency: predicted score ${pred.predicted_score_home}-${pred.predicted_score_away} but verdict is "over 2.5"`);
  }
  if (pred.over_under_25 === "under" && totalScore > 2) {
    warnings.push(`Inconsistency: predicted score ${pred.predicted_score_home}-${pred.predicted_score_away} but verdict is "under 2.5"`);
  }
  if (pred.btts === "yes" && (pred.predicted_score_home === 0 || pred.predicted_score_away === 0)) {
    warnings.push(`Inconsistency: BTTS "yes" but predicted score has a team at 0 goals`);
  }
  if (pred.btts === "no" && pred.predicted_score_home > 0 && pred.predicted_score_away > 0) {
    warnings.push(`Inconsistency: BTTS "no" but both teams predicted to score`);
  }

  return warnings;
}

// Detect match importance from round info
function detectMatchImportance(round: string | null, league: string): { level: string; description: string } {
  const r = (round || "").toLowerCase();
  if (r.includes("final") && !r.includes("semi") && !r.includes("quarter")) {
    return { level: "CRITICAL", description: "Cup/Tournament Final — highest stakes, expect tactical caution and low-scoring game" };
  }
  if (r.includes("semi-final") || r.includes("semi final")) {
    return { level: "HIGH", description: "Semi-Final — high stakes, teams may prioritize defense" };
  }
  if (r.includes("quarter-final") || r.includes("quarter final")) {
    return { level: "HIGH", description: "Quarter-Final — knockout pressure affects risk-taking" };
  }
  if (r.includes("leg 2") || r.includes("2nd leg")) {
    return { level: "HIGH", description: "Second Leg — aggregate context affects tactics, may see more attacking or ultra-defensive approach depending on first leg result" };
  }
  // Late season detection
  const roundNum = parseInt((r.match(/\d+/) || ["0"])[0]);
  if (roundNum >= 34 || r.includes("matchday 3") && (league.includes("Champions") || league.includes("Europa"))) {
    return { level: "MEDIUM", description: "Late season/crucial group stage — positioning at stake" };
  }
  return { level: "NORMAL", description: "" };
}

// Detect momentum and streaks
function detectMomentum(formStr: string[]): { streak: string; momentum: string; details: string } {
  if (!formStr || formStr.length === 0) return { streak: "unknown", momentum: "neutral", details: "" };

  const results = formStr.map(f => f.charAt(0)); // W, D, or L
  
  // Detect streaks
  let currentStreak = 1;
  for (let i = 1; i < results.length; i++) {
    if (results[i] === results[0]) currentStreak++;
    else break;
  }

  const wins = results.filter(r => r === "W").length;
  const losses = results.filter(r => r === "L").length;
  const draws = results.filter(r => r === "D").length;

  let streak = "";
  let momentum = "neutral";
  let details = "";

  if (results[0] === "W" && currentStreak >= 3) {
    streak = `${currentStreak}-match winning streak`;
    momentum = "strong_positive";
    details = `On a ${currentStreak}-match winning streak. ${wins}/5 wins in last 5 matches. High confidence momentum.`;
  } else if (results[0] === "L" && currentStreak >= 3) {
    streak = `${currentStreak}-match losing streak`;
    momentum = "strong_negative";
    details = `On a ${currentStreak}-match losing streak. ${losses}/5 losses in last 5 matches. Crisis mode.`;
  } else if (wins >= 4) {
    streak = "dominant form";
    momentum = "positive";
    details = `${wins}/5 wins in last 5 matches. Excellent form.`;
  } else if (losses >= 4) {
    streak = "poor form";
    momentum = "negative";
    details = `${losses}/5 losses in last 5 matches. Very poor form.`;
  } else if (results.slice(0, 3).every(r => r !== "L")) {
    streak = "unbeaten in 3";
    momentum = "slight_positive";
    details = `Unbeaten in last 3. ${wins}W ${draws}D ${losses}L in last 5.`;
  } else if (draws >= 3) {
    streak = "draw-heavy";
    momentum = "neutral";
    details = `${draws} draws in last 5 matches. Tendency to share points.`;
  } else {
    streak = "mixed";
    momentum = "neutral";
    details = `${wins}W ${draws}D ${losses}L in last 5. Inconsistent.`;
  }

  return { streak, momentum, details };
}

// Extract structured signals from news context
function extractNewsSignals(liveContext: string, homeName: string, awayName: string): string {
  if (!liveContext) return "";

  const signals: string[] = [];
  const lc = liveContext.toLowerCase();

  // Key player injury signals
  const injuryPatterns = [
    { pattern: /injur(ed|y)|ruled out|doubtful|miss/gi, signal: "Injury concern" },
    { pattern: /suspend(ed)?|red card|ban/gi, signal: "Suspension" },
    { pattern: /return|fit again|back in squad|available/gi, signal: "Player return" },
  ];

  for (const { pattern, signal } of injuryPatterns) {
    const matches = liveContext.match(pattern);
    if (matches && matches.length > 0) {
      signals.push(`${signal} detected in news (${matches.length} mention${matches.length > 1 ? "s" : ""})`);
    }
  }

  // Manager/tactical signals
  if (lc.includes("rotation") || lc.includes("rest") || lc.includes("squad rotation")) {
    signals.push("Squad rotation likely — may weaken starting XI");
  }
  if (lc.includes("must win") || lc.includes("must-win") || lc.includes("crucial")) {
    signals.push("High-stakes match — expect maximum effort from both sides");
  }
  if (lc.includes("derby") || lc.includes("rival")) {
    signals.push("Derby/Rivalry match — expect intensity, possible cards, and tactical battles");
  }

  if (signals.length === 0) return "";
  return `\nNEWS SIGNAL ANALYSIS:\n${signals.map(s => `📰 ${s}`).join("\n")}`;
}

// Determine if a league is international
const INTERNATIONAL_LEAGUES = [
  "World Cup", "WC Qualifiers Europe", "WC Qualifiers South America", "WC Qualifiers CONCACAF",
  "Nations League", "Euro Championship", "Copa America", "Friendlies",
];

function isInternational(league: string): boolean {
  return INTERNATIONAL_LEAGUES.some(l => league.includes(l));
}

// Compute league-specific averages from completed matches
function computeLeagueAvg(matches: any[], league: string): { homeAvg: number; awayAvg: number } {
  const leagueMatches = (matches || []).filter((m: any) => m.league === league && m.goals_home != null);
  if (leagueMatches.length < 10) return { homeAvg: 1.45, awayAvg: 1.15 };
  let hg = 0, ag = 0;
  for (const m of leagueMatches) { hg += m.goals_home ?? 0; ag += m.goals_away ?? 0; }
  return {
    homeAvg: Math.round((hg / leagueMatches.length) * 100) / 100,
    awayAvg: Math.round((ag / leagueMatches.length) * 100) / 100,
  };
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

    // Fetch all data in parallel
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
      { data: homeTeamStats },
      { data: awayTeamStats },
      { data: homePlayers },
      { data: awayPlayers },
      { data: leagueMatches },
      { data: filData },
    ] = await Promise.all([
      supabase.from("predictions").select("*").eq("match_id", match_id).single(),
      supabase.from("odds").select("*").eq("match_id", match_id).single(),
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id, status, xg_home, xg_away")
        .or(`team_home_id.eq.${match.team_home_id},team_away_id.eq.${match.team_home_id}`)
        .eq("status", "completed").order("match_date", { ascending: false }).limit(10),
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id, status, xg_home, xg_away")
        .or(`team_home_id.eq.${match.team_away_id},team_away_id.eq.${match.team_away_id}`)
        .eq("status", "completed").order("match_date", { ascending: false }).limit(10),
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .eq("team_home_id", match.team_home_id).eq("status", "completed")
        .order("match_date", { ascending: false }).limit(10),
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .eq("team_away_id", match.team_away_id).eq("status", "completed")
        .order("match_date", { ascending: false }).limit(10),
      supabase.from("matches")
        .select("goals_home, goals_away, match_date, team_home_id, team_away_id, home_team:teams!matches_team_home_id_fkey(name), away_team:teams!matches_team_away_id_fkey(name)")
        .or(`and(team_home_id.eq.${match.team_home_id},team_away_id.eq.${match.team_away_id}),and(team_home_id.eq.${match.team_away_id},team_away_id.eq.${match.team_home_id})`)
        .eq("status", "completed").order("match_date", { ascending: false }).limit(10),
      supabase.from("matches")
        .select("ai_post_match_review, ai_accuracy_score, team_home_id, team_away_id, league, home_team:teams!matches_team_home_id_fkey(name), away_team:teams!matches_team_away_id_fkey(name)")
        .not("ai_post_match_review", "is", null).eq("status", "completed")
        .order("match_date", { ascending: false }).limit(10),
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .or(`team_home_id.eq.${match.team_home_id},team_away_id.eq.${match.team_home_id}`)
        .eq("status", "completed").order("match_date", { ascending: false }).limit(20),
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .or(`team_home_id.eq.${match.team_away_id},team_away_id.eq.${match.team_away_id}`)
        .eq("status", "completed").order("match_date", { ascending: false }).limit(20),
      supabase.from("match_context")
        .select("injuries_home, injuries_away, lineup_home, lineup_away, suspensions, weather, news_items")
        .eq("match_id", match_id).single(),
      supabase.from("team_statistics").select("*").eq("team_id", match.team_home_id).order("season", { ascending: false }).limit(1),
      supabase.from("team_statistics").select("*").eq("team_id", match.team_away_id).order("season", { ascending: false }).limit(1),
      supabase.from("players").select("name, position, age, nationality").eq("team_id", match.team_home_id).order("name").limit(30),
      supabase.from("players").select("name, position, age, nationality").eq("team_id", match.team_away_id).order("name").limit(30),
      // League average goals for dynamic Poisson
      supabase.from("matches")
        .select("goals_home, goals_away, league")
        .eq("league", match.league).eq("status", "completed")
        .order("match_date", { ascending: false }).limit(200),
      // Football Intelligence Layer
      supabase.from("match_intelligence")
        .select("match_narrative, tactical_analysis, player_impacts, momentum_home, momentum_away, context_summary")
        .eq("match_id", match_id).maybeSingle(),
    ]);

    const homeName = match.home_team?.name ?? "Home";
    const awayName = match.away_team?.name ?? "Away";

    // Compute league-specific averages
    const leagueAvg = computeLeagueAvg(leagueMatches || [], match.league);

    // Fetch live web context
    const liveContext = await fetchMatchContext(
      homeName, awayName, match.league, match.match_date, supabaseUrl, serviceKey,
      match.api_football_id, match.home_team?.api_football_id, match.away_team?.api_football_id,
      match_id
    );

    // Build form strings (expanded to last 10 for trend detection)
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

    // Momentum detection
    const homeMomentum = detectMomentum(homeFormStr);
    const awayMomentum = detectMomentum(awayFormStr);

    // Match importance
    const importance = detectMatchImportance(match.round, match.league);

    // H2H summary
    let h2hBlock = "";
    if (h2hMatches && h2hMatches.length > 0) {
      const h2hLines = h2hMatches.map((m: any) => {
        const hName = (m as any).home_team?.name ?? "?";
        const aName = (m as any).away_team?.name ?? "?";
        return `${m.match_date?.slice(0, 10)}: ${hName} ${m.goals_home}-${m.goals_away} ${aName}`;
      });

      // H2H stats summary
      let homeH2HWins = 0, awayH2HWins = 0, h2hDraws = 0, h2hTotalGoals = 0;
      for (const m of h2hMatches) {
        const homeIsHome = m.team_home_id === match.team_home_id;
        const hg = homeIsHome ? m.goals_home : m.goals_away;
        const ag = homeIsHome ? m.goals_away : m.goals_home;
        h2hTotalGoals += (m.goals_home ?? 0) + (m.goals_away ?? 0);
        if (hg! > ag!) homeH2HWins++;
        else if (hg === ag) h2hDraws++;
        else awayH2HWins++;
      }
      const h2hAvgGoals = (h2hTotalGoals / h2hMatches.length).toFixed(1);

      h2hBlock = `\nHEAD-TO-HEAD (last ${h2hMatches.length} meetings):
${h2hLines.join("\n")}
H2H Summary: ${homeName} ${homeH2HWins}W, ${h2hDraws}D, ${awayH2HWins}W ${awayName} | Avg goals: ${h2hAvgGoals} per match`;
    }

    // Goal-scoring stats from raw matches with exponential weighting
    function calcStats(matches: any[], teamId: string) {
      if (!matches || matches.length === 0) return null;
      let scored = 0, conceded = 0, cleanSheets = 0, bttsCount = 0;
      let weightedScored = 0, weightedConceded = 0, totalWeight = 0;
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        const isHome = m.team_home_id === teamId;
        const gf = isHome ? (m.goals_home ?? 0) : (m.goals_away ?? 0);
        const ga = isHome ? (m.goals_away ?? 0) : (m.goals_home ?? 0);
        scored += gf; conceded += ga;
        if (ga === 0) cleanSheets++;
        if (gf > 0 && ga > 0) bttsCount++;
        // Exponential decay: recent matches weighted more
        const weight = Math.pow(0.85, i);
        weightedScored += gf * weight;
        weightedConceded += ga * weight;
        totalWeight += weight;
      }
      return {
        played: matches.length,
        avgScored: (scored / matches.length).toFixed(1),
        avgConceded: (conceded / matches.length).toFixed(1),
        weightedAvgScored: (weightedScored / totalWeight).toFixed(2),
        weightedAvgConceded: (weightedConceded / totalWeight).toFixed(2),
        cleanSheets,
        bttsRate: Math.round((bttsCount / matches.length) * 100),
      };
    }

    const homeStats = calcStats(homeAllMatches || [], match.team_home_id);
    const awayStats = calcStats(awayAllMatches || [], match.team_away_id);

    let statsBlock = "";
    if (homeStats) {
      statsBlock += `\n${homeName} stats (last ${homeStats.played}): avg scored ${homeStats.avgScored} (weighted recent: ${homeStats.weightedAvgScored}), avg conceded ${homeStats.avgConceded} (weighted: ${homeStats.weightedAvgConceded}), clean sheets ${homeStats.cleanSheets}, BTTS rate ${homeStats.bttsRate}%`;
    }
    if (awayStats) {
      statsBlock += `\n${awayName} stats (last ${awayStats.played}): avg scored ${awayStats.avgScored} (weighted recent: ${awayStats.weightedAvgScored}), avg conceded ${awayStats.avgConceded} (weighted: ${awayStats.weightedAvgConceded}), clean sheets ${awayStats.cleanSheets}, BTTS rate ${awayStats.bttsRate}%`;
    }

    // Team statistics enrichment
    let teamStatsBlock = "";
    const hts = homeTeamStats?.[0];
    const ats = awayTeamStats?.[0];
    if (hts) {
      const hr = hts.home_record as any;
      teamStatsBlock += `\n${homeName} SEASON STATS: ${hts.wins}W ${hts.draws}D ${hts.losses}L, GF ${hts.goals_for} GA ${hts.goals_against} (GD ${hts.goal_diff}), Form: ${hts.form || "N/A"}`;
      if (hr?.wins != null) teamStatsBlock += `, HOME: ${hr.wins}W ${hr.draws}D ${hr.losses}L`;
    }
    if (ats) {
      const ar = ats.away_record as any;
      teamStatsBlock += `\n${awayName} SEASON STATS: ${ats.wins}W ${ats.draws}D ${ats.losses}L, GF ${ats.goals_for} GA ${ats.goals_against} (GD ${ats.goal_diff}), Form: ${ats.form || "N/A"}`;
      if (ar?.wins != null) teamStatsBlock += `, AWAY: ${ar.wins}W ${ar.draws}D ${ar.losses}L`;
    }

    // Players block
    let playersBlock = "";
    if (homePlayers && homePlayers.length > 0) {
      const byPos = (pos: string) => homePlayers.filter((p: any) => p.position === pos).map((p: any) => p.name);
      playersBlock += `\n${homeName} SQUAD (${homePlayers.length} players): GK: ${byPos("Goalkeeper").join(", ") || "N/A"} | DEF: ${byPos("Defender").join(", ") || "N/A"} | MID: ${byPos("Midfielder").join(", ") || "N/A"} | FWD: ${byPos("Attacker").join(", ") || "N/A"}`;
    }
    if (awayPlayers && awayPlayers.length > 0) {
      const byPos = (pos: string) => awayPlayers.filter((p: any) => p.position === pos).map((p: any) => p.name);
      playersBlock += `\n${awayName} SQUAD (${awayPlayers.length} players): GK: ${byPos("Goalkeeper").join(", ") || "N/A"} | DEF: ${byPos("Defender").join(", ") || "N/A"} | MID: ${byPos("Midfielder").join(", ") || "N/A"} | FWD: ${byPos("Attacker").join(", ") || "N/A"}`;
    }

    // Statistical pre-computation with league-specific averages
    const statsAnchors = computeStatisticalAnchors(homeStats, awayStats, odds, leagueAvg.homeAvg, leagueAvg.awayAvg);

    let statsAnchorsBlock = "";
    if (statsAnchors.poisson_xg_home != null) {
      statsAnchorsBlock += `\nSTATISTICAL MODEL (Poisson with home advantage):
League avg goals: Home ${leagueAvg.homeAvg}, Away ${leagueAvg.awayAvg} (from ${(leagueMatches || []).length} matches)
Poisson xG: ${homeName} ${statsAnchors.poisson_xg_home} - ${statsAnchors.poisson_xg_away} ${awayName}
Poisson probabilities: Home ${Math.round(statsAnchors.poisson_home_win * 100)}%, Draw ${Math.round(statsAnchors.poisson_draw * 100)}%, Away ${Math.round(statsAnchors.poisson_away_win * 100)}%
Poisson Over 2.5: ${Math.round(statsAnchors.poisson_over_25 * 100)}%
Poisson BTTS: ${Math.round(statsAnchors.poisson_btts * 100)}%`;
    }
    if (statsAnchors.implied_home_win != null) {
      statsAnchorsBlock += `\nMARKET IMPLIED PROBABILITIES (from odds):
Home ${Math.round(statsAnchors.implied_home_win * 100)}%, Draw ${Math.round(statsAnchors.implied_draw * 100)}%, Away ${Math.round(statsAnchors.implied_away_win * 100)}%
Market margin: ${Math.round(statsAnchors.market_margin * 100)}%`;

      // Add Poisson vs Market delta analysis
      if (statsAnchors.poisson_home_win != null) {
        const homeDelta = Math.round((statsAnchors.poisson_home_win - statsAnchors.implied_home_win) * 100);
        const drawDelta = Math.round((statsAnchors.poisson_draw - statsAnchors.implied_draw) * 100);
        const awayDelta = Math.round((statsAnchors.poisson_away_win - statsAnchors.implied_away_win) * 100);
        statsAnchorsBlock += `\nMODEL vs MARKET DELTA: Home ${homeDelta > 0 ? "+" : ""}${homeDelta}%, Draw ${drawDelta > 0 ? "+" : ""}${drawDelta}%, Away ${awayDelta > 0 ? "+" : ""}${awayDelta}%`;
        const maxDelta = Math.max(Math.abs(homeDelta), Math.abs(drawDelta), Math.abs(awayDelta));
        if (maxDelta > 10) {
          statsAnchorsBlock += `\n⚠️ SIGNIFICANT DISAGREEMENT with market (${maxDelta}%). Investigate why.`;
        }
      }
    }

    // Match context structured data
    let contextBlock = "";
    let hasConfirmedLineups = false;
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
      // Lineup quality assessment
      const homeLineup = ctx.lineup_home;
      const awayLineup = ctx.lineup_away;
      if (homeLineup && (Array.isArray(homeLineup) ? homeLineup.length > 0 : homeLineup.starters)) {
        hasConfirmedLineups = true;
        const lu = Array.isArray(homeLineup) ? homeLineup[0] : homeLineup;
        if (lu?.starters) {
          contextBlock += `\n${homeName} CONFIRMED LINEUP (${lu.formation || "?"}): ${lu.starters.map((p: any) => `${p.name}${p.pos ? ` [${p.pos}]` : ""}`).join(", ")}`;
          if (lu.bench?.length > 0) {
            contextBlock += `\n${homeName} BENCH: ${lu.bench.map((p: any) => p.name).join(", ")}`;
          }
        }
      }
      if (awayLineup && (Array.isArray(awayLineup) ? awayLineup.length > 0 : awayLineup.starters)) {
        hasConfirmedLineups = true;
        const lu = Array.isArray(awayLineup) ? awayLineup[0] : awayLineup;
        if (lu?.starters) {
          contextBlock += `\n${awayName} CONFIRMED LINEUP (${lu.formation || "?"}): ${lu.starters.map((p: any) => `${p.name}${p.pos ? ` [${p.pos}]` : ""}`).join(", ")}`;
          if (lu.bench?.length > 0) {
            contextBlock += `\n${awayName} BENCH: ${lu.bench.map((p: any) => p.name).join(", ")}`;
          }
        }
      }
    }

    // News signal extraction
    const newsSignals = extractNewsSignals(liveContext, homeName, awayName);

    // Data quality confidence — enhanced with lineup awareness
    const hasInjuryData = (matchContext?.data?.injuries_home?.length > 0 || matchContext?.data?.injuries_away?.length > 0);
    const dataQuality = computeDataQualityConfidence(
      homeFormStr.length, !!odds, h2hMatches != null && h2hMatches.length > 0,
      hasInjuryData, homeStats != null && awayStats != null,
      (homePlayers?.length ?? 0) > 0 && (awayPlayers?.length ?? 0) > 0,
      hts != null && ats != null,
      hasConfirmedLineups
    );

    // Learning context + performance-aware calibration
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

    // ── RECENT ERRORS: query prediction_reviews for same teams/league ──
    const { data: recentErrors } = await supabase
      .from("prediction_reviews")
      .select("*")
      .or(`league.eq.${match.league}`)
      .eq("outcome_correct", false)
      .order("created_at", { ascending: false })
      .limit(20);

    let recentErrorsBlock = "";
    if (recentErrors && recentErrors.length > 0) {
      // Group errors by type
      const errorCounts: Record<string, number> = {};
      for (const e of recentErrors) {
        if (e.error_type) errorCounts[e.error_type] = (errorCounts[e.error_type] || 0) + 1;
      }
      const topErrors = Object.entries(errorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

      // Find team-specific errors
      const teamErrors = recentErrors.filter((e: any) => {
        // We don't have team_id on prediction_reviews, but we can match by league
        return e.league === match.league;
      });

      recentErrorsBlock = `\n\nRECENT PREDICTION ERRORS (${match.league}):
Top error patterns: ${topErrors.map(([type, count]) => `${type} (${count}x)`).join(", ")}
${teamErrors.length > 0 ? `Recent ${match.league} mistakes: ${teamErrors.slice(0, 5).map((e: any) =>
        `predicted ${e.predicted_outcome} → actual ${e.actual_outcome} (conf: ${Math.round((e.confidence_at_prediction || 0) * 100)}%, error: ${e.error_type})`
      ).join("; ")}` : ""}
⚠️ LEARN FROM THESE: Adjust your reasoning to avoid repeating these specific error patterns.`;
    }
    learningBlock += recentErrorsBlock;

    // Fetch model_performance for calibration awareness
    const { data: perfData } = await supabase
      .from("model_performance")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    let performanceBlock = "";
    let featureWeights: any = null;
    if (perfData && perfData.length > 0) {
      const mp = perfData[0] as any;
      featureWeights = mp.feature_weights;
      performanceBlock = `\n\nMODEL PERFORMANCE AWARENESS:
Historical accuracy: 1X2 ${mp.outcome_accuracy}%, O/U 2.5 ${mp.ou_25_accuracy}%, BTTS ${mp.btts_accuracy}%
Brier scores: 1X2 ${mp.avg_brier_1x2}, O/U ${mp.avg_brier_ou}, BTTS ${mp.avg_brier_btts}
MAE goals: ${mp.mae_goals}
Exact score hits: ${mp.exact_score_hits}/${mp.total_matches}`;

      // Add calibration warnings
      const cal = mp.calibration_data as Record<string, any> | null;
      if (cal) {
        const warnings: string[] = [];
        for (const [key, val] of Object.entries(cal)) {
          if (val.count >= 10) {
            const gap = val.avg_predicted - val.actual_rate;
            if (gap > 0.1) warnings.push(`OVERCONFIDENT in ${key}% range (predicted ${Math.round(val.avg_predicted * 100)}%, actual ${Math.round(val.actual_rate * 100)}%) — reduce probabilities in this range`);
            if (gap < -0.1) warnings.push(`UNDERCONFIDENT in ${key}% range — be more decisive when your analysis points this way`);
          }
        }
        if (warnings.length > 0) {
          performanceBlock += `\nCALIBRATION WARNINGS:\n${warnings.map(w => `⚠️ ${w}`).join("\n")}`;
        }
      }

      // Add weak area warnings
      const weakAreas = mp.weak_areas as string[] | null;
      if (weakAreas && weakAreas.length > 0) {
        performanceBlock += `\nKNOWN WEAKNESSES:\n${weakAreas.slice(0, 5).map((w: string) => `• ${w}`).join("\n")}`;
      }

      // Dynamic feature weight suggestions
      if (featureWeights && Object.keys(featureWeights).length > 0) {
        performanceBlock += `\nDYNAMIC WEIGHT ADJUSTMENTS (from performance analysis):\n${Object.entries(featureWeights).map(([k, v]) => `• ${k}: ${v}`).join("\n")}`;
      }
    }
    learningBlock += performanceBlock;

    // Determine weight structure based on competition type
    const intl = isInternational(match.league);
    const weightBlock = intl
      ? `FEATURE WEIGHTS (International match):
- Recent Form: 40% (most important — national team form is volatile)
- Squad Quality: 25% (player caliber matters more than club stats)
- H2H History: 10% (less relevant for international)
- Home Advantage: 15%
- Market Odds: 10%`
      : `FEATURE WEIGHTS (Club match):
- Recent Form (last 5-10): 30% (use WEIGHTED recent averages, home/away split matters)
- Offensive/Defensive Stats: 25% (weighted avg goals > raw avg, xG if available, clean sheets)
- H2H History: 15% (last 5-10 meetings, focus on recent trend)
- Home/Away Advantage: 15% (league home avg: ${leagueAvg.homeAvg}, away avg: ${leagueAvg.awayAvg} — this measures real home advantage in ${match.league})
- Market Odds: 10% (implied probabilities as reality check, flag value when model disagrees >5%)
- Momentum/Context: 5% (streaks, match importance, injuries)`;

    // Momentum block
    let momentumBlock = "";
    if (homeMomentum.details) {
      momentumBlock += `\n${homeName} MOMENTUM: ${homeMomentum.details}`;
    }
    if (awayMomentum.details) {
      momentumBlock += `\n${awayName} MOMENTUM: ${awayMomentum.details}`;
    }

    // Match importance block
    let importanceBlock = "";
    if (importance.level !== "NORMAL") {
      importanceBlock = `\nMATCH IMPORTANCE: ${importance.level} — ${importance.description}`;
    }

    const systemPrompt = `You are a world-class football analyst providing REASONING and CONTEXT for match predictions. The statistical probabilities (1X2, xG, Over/Under lines) are computed by a deterministic Poisson model and CANNOT be changed by you. Your job is to EXPLAIN why those probabilities make sense (or flag when they might be off), provide contextual insights, and suggest small confidence adjustments.

${weightBlock}

REASONING LAYERS (apply in order):
LAYER 1 — ACKNOWLEDGE STATISTICAL MODEL: Reference the Poisson probabilities provided. Do NOT generate your own probability numbers.
LAYER 2 — FEATURE ANALYSIS: Apply weighted form, stats, H2H, and positional data to explain the statistical output.
LAYER 3 — CONTEXTUAL: Adjust reasoning for injuries, suspensions, confirmed lineups, weather, match importance, and momentum.
LAYER 4 — MARKET INTELLIGENCE: Compare Poisson output with market implied probabilities. Note disagreements >5% and explain.
LAYER 5 — CONTRARIAN CHECK: Argue AGAINST the statistical prediction. List 1-2 reasons it could be wrong.

CRITICAL RULES:
1. You do NOT set home_win, draw, away_win, or expected_goals — those come from the statistical engine
2. You provide reasoning, predicted scoreline, BTTS verdict, and a small confidence_adjustment (-0.10 to +0.10)
3. Every claim MUST reference specific statistics from the data provided
4. Predicted scoreline must be derived from actual goal-scoring averages (use WEIGHTED recent averages)
5. BTTS must be justified by both teams' scoring/conceding rates
6. List which live data sources you referenced in live_data_sources
7. List the most impactful factors in highlight_key_factors
8. If your analysis suggests the statistical model is significantly wrong, explain why in contrarian_note
9. AVOID defaulting to draws — only predict draw when evidence strongly supports it
10. Be honest about uncertainty — use confidence_adjustment to lower confidence when data is sparse

DATA QUALITY NOTE: This prediction has a data quality score of ${Math.round(dataQuality * 100)}%. ${dataQuality < 0.5 ? "Data is limited — suggest negative confidence_adjustment." : dataQuality < 0.7 ? "Moderate data coverage." : "Good data coverage."}
${!hasConfirmedLineups ? "⚠️ NO CONFIRMED LINEUPS — suggest confidence_adjustment of -0.05 to -0.10." : "✅ Confirmed lineups available."}

You must call the predict_match tool with your structured analysis.`;

    const userPrompt = `Analyze this match and call predict_match with your prediction.

Match: ${homeName} vs ${awayName}
League: ${match.league}${intl ? " (INTERNATIONAL)" : ""}
Round: ${match.round || "N/A"}
Date: ${match.match_date}
${match.status === "completed" ? `Final Score: ${match.goals_home}-${match.goals_away}` : "Status: Upcoming"}
${match.xg_home != null ? `xG: ${match.xg_home}-${match.xg_away}` : ""}
${importanceBlock}

${prediction ? `Existing Model: Home ${Math.round(prediction.home_win * 100)}%, Draw ${Math.round(prediction.draw * 100)}%, Away ${Math.round(prediction.away_win * 100)}%
xG: ${prediction.expected_goals_home}-${prediction.expected_goals_away}, O/U 2.5: ${prediction.over_under_25}, Confidence: ${Math.round(prediction.model_confidence * 100)}%` : "No existing prediction."}

${odds ? `Odds: Home ${odds.home_win_odds}, Draw ${odds.draw_odds}, Away ${odds.away_win_odds}` : ""}
${statsAnchorsBlock}

${homeFormStr.length ? `${homeName} form (last ${homeFormStr.length}): ${homeFormStr.join(", ")}` : ""}
${awayFormStr.length ? `${awayName} form (last ${awayFormStr.length}): ${awayFormStr.join(", ")}` : ""}
${homeHomeForm.length ? `${homeName} HOME form: ${homeHomeForm.join(", ")}` : ""}
${awayAwayForm.length ? `${awayName} AWAY form: ${awayAwayForm.join(", ")}` : ""}
${momentumBlock}
${teamStatsBlock}
${playersBlock}
${h2hBlock}
${statsBlock}
${contextBlock}
${newsSignals}
${liveContext ? `\nLIVE CONTEXT (injuries, suspensions, lineups, news):\n${liveContext}` : ""}
${match.referee ? `\nREFEREE: ${match.referee}` : ""}
${filData ? `\nFOOTBALL INTELLIGENCE LAYER:
Narrative: ${(filData as any).match_narrative || "N/A"}
Tactical: ${JSON.stringify((filData as any).tactical_analysis || {})}
Player Impacts: ${((filData as any).player_impacts || []).slice(0, 5).map((p: any) => `${p.name} (${p.status}, importance ${p.importance}): ${p.impact_description}`).join("; ")}
Momentum: ${(filData as any).match_narrative ? `Home ${(filData as any).momentum_home}/100, Away ${(filData as any).momentum_away}/100` : "N/A"}
Summary: ${(filData as any).context_summary || "N/A"}` : ""}
${learningBlock}
\nVOLATILITY NOTE: If the referee is known to be strict or both teams are aggressive, factor this into your reasoning about match tempo and card risk. This may affect Over/Under and BTTS assessments.

IMPORTANT: 
1. Your reasoning must cite SPECIFIC numbers from the data above. Every claim must reference a stat.
2. You do NOT set probabilities (home_win/draw/away_win/xG) — those are from the Poisson model above.
3. You provide: reasoning, predicted_score, btts, confidence_adjustment, highlight_key_factors, live_data_sources, contrarian_note.
4. Ensure predicted score is CONSISTENT with BTTS verdict.
5. Flag any anomalies or data gaps in the anomalies field.
6. Before finalizing, do a CONTRARIAN CHECK: state 1-2 reasons the prediction could be wrong.
7. List ALL sources you referenced (form data, H2H, news, injury reports) in live_data_sources.
8. List the 3-5 most impactful factors in highlight_key_factors.`;

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not set");

    // ── Step 0: Ensure statistical prediction exists first (AI-free base) ──
    // Use a timeout to prevent this from blocking too long
    try {
      const statController = new AbortController();
      const statTimeout = setTimeout(() => statController.abort(), 20000); // 20s max
      await fetch(`${supabaseUrl}/functions/v1/generate-statistical-prediction`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ match_id }),
        signal: statController.signal,
      });
      clearTimeout(statTimeout);
    } catch (_) { /* statistical prediction is best-effort */ }

    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), 60000); // 60s max for AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 3000,
        tools: [{
          type: "function",
          function: {
            name: "predict_match",
            description: "Submit structured match prediction with multi-layer fact-based reasoning",
            parameters: {
              type: "object",
              properties: {
                predicted_score_home: { type: "integer", description: "Predicted exact goals for home team" },
                predicted_score_away: { type: "integer", description: "Predicted exact goals for away team" },
                btts: { type: "string", enum: ["yes", "no"], description: "Both teams to score" },
                confidence_adjustment: { type: "number", description: "Small adjustment to model confidence, between -0.10 and +0.10." },
                winner_reasoning: { type: "string", description: "3-4 bullet points citing specific stats for why this team wins/draws." },
                btts_reasoning: { type: "string", description: "2 bullet points with specific scoring/conceding rates justifying BTTS verdict." },
                over_under_reasoning: { type: "string", description: "2 bullet points justifying O/U verdict." },
                key_factors: { type: "string", description: "3-4 bullet points about injuries, suspensions, tactical factors." },
                contrarian_check: { type: "string", description: "1-2 bullet points arguing AGAINST the prediction." },
                contrarian_note: { type: "string", description: "Optional: explain if the statistical model is significantly wrong." },
                highlight_key_factors: { type: "array", items: { type: "string" }, description: "3-5 most impactful factors" },
                live_data_sources: { type: "array", items: { type: "string" }, description: "List of data sources referenced" },
                anomalies: { type: "array", items: { type: "string" }, description: "List of anomalies or data gaps" },
              },
              required: [
                "predicted_score_home", "predicted_score_away", "btts",
                "confidence_adjustment", "winner_reasoning", "btts_reasoning", "over_under_reasoning",
                "key_factors", "contrarian_check", "highlight_key_factors", "live_data_sources", "anomalies"
              ],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "predict_match" } },
      }),
      signal: aiController.signal,
    });
    clearTimeout(aiTimeout);

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

    // ── Fetch existing statistical prediction as source of truth ──
    const { data: statPred } = await supabase
      .from("predictions")
      .select("*")
      .eq("match_id", match_id)
      .maybeSingle();

    // Use Poisson statistical values as the final probabilities
    const hw = statPred?.home_win ?? statsAnchors.poisson_home_win ?? 0.4;
    const dr = statPred?.draw ?? statsAnchors.poisson_draw ?? 0.3;
    const aw = statPred?.away_win ?? statsAnchors.poisson_away_win ?? 0.3;
    const lambdaH = statPred?.expected_goals_home ?? statsAnchors.poisson_xg_home ?? 1.2;
    const lambdaA = statPred?.expected_goals_away ?? statsAnchors.poisson_xg_away ?? 1.0;

    // Use statistical goal lines and distribution if available, else recompute from Poisson lambdas
    const goalLines = (statPred?.goal_lines as Record<string, number>) ?? computeGoalLines(lambdaH, lambdaA);
    const goalDist = (statPred?.goal_distribution as Record<string, number>) ?? computeGoalDistribution(lambdaH, lambdaA);

    // Validation — only for predicted score consistency
    const warnings = validatePrediction(pred);
    if (warnings.length > 0) {
      console.warn("Prediction validation warnings:", warnings);
      pred.btts = (pred.predicted_score_home > 0 && pred.predicted_score_away > 0) ? "yes" : "no";
    }

    // ── Score-Probability Consistency Enforcement ──
    // If AI predicted score contradicts statistical probabilities, override
    const scoreH = pred.predicted_score_home ?? 0;
    const scoreA = pred.predicted_score_away ?? 0;
    if (hw > dr && hw > aw && scoreH <= scoreA) {
      // Stats say home win but AI score says draw/away → force home win score
      if (lambdaH >= 2) { pred.predicted_score_home = 2; pred.predicted_score_away = 1; }
      else { pred.predicted_score_home = 1; pred.predicted_score_away = 0; }
      console.warn("Score overridden: stats predict home win but AI gave", scoreH, "-", scoreA);
    } else if (aw > hw && aw > dr && scoreA <= scoreH) {
      if (lambdaA >= 2) { pred.predicted_score_home = 1; pred.predicted_score_away = 2; }
      else { pred.predicted_score_home = 0; pred.predicted_score_away = 1; }
      console.warn("Score overridden: stats predict away win but AI gave", scoreH, "-", scoreA);
    } else if (dr > hw && dr > aw && scoreH !== scoreA) {
      const drawGoals = Math.round(Math.min(lambdaH, lambdaA));
      pred.predicted_score_home = drawGoals;
      pred.predicted_score_away = drawGoals;
      console.warn("Score overridden: stats predict draw but AI gave", scoreH, "-", scoreA);
    }
    // Update BTTS after potential score override
    pred.btts = (pred.predicted_score_home > 0 && pred.predicted_score_away > 0) ? "yes" : "no";

    // Build structured reasoning text
    const anomaliesStr = (pred.anomalies && pred.anomalies.length > 0)
      ? `\n\n⚠️ ANOMALIES & DATA NOTES:\n${pred.anomalies.map((a: string) => `• ${a}`).join("\n")}`
      : "";

    const contrarianStr = pred.contrarian_check
      ? `\n\n🔄 CONTRARIAN CHECK:\n${pred.contrarian_check}`
      : "";

    const contrarianNoteStr = pred.contrarian_note
      ? `\n\n💡 CONTRARIAN NOTE:\n${pred.contrarian_note}`
      : "";

    // Format highlight key factors
    const keyFactorsStr = (pred.highlight_key_factors && pred.highlight_key_factors.length > 0)
      ? `\n\n🎯 KEY FACTORS:\n${pred.highlight_key_factors.map((f: string) => `• ${f}`).join("\n")}`
      : "";

    // Format live data sources
    const liveSourcesStr = (pred.live_data_sources && pred.live_data_sources.length > 0)
      ? `\n\n📡 LIVE DATA SOURCES:\n${pred.live_data_sources.map((s: string) => `• ${s}`).join("\n")}`
      : "";

    const reasoning = [
      `🏆 WINNER ANALYSIS:`,
      pred.winner_reasoning || "",
      ``,
      `⚽ BTTS (${(pred.btts || "no").toUpperCase()}):`,
      pred.btts_reasoning || "",
      ``,
      `📊 OVER/UNDER 2.5 (${goalLines.over_2_5 > 0.5 ? "OVER" : "UNDER"}):`,
      pred.over_under_reasoning || "",
      contrarianStr,
      contrarianNoteStr,
      keyFactorsStr,
      liveSourcesStr,
      anomaliesStr,
    ].join("\n");

    // New confidence blend: 50% data quality, 30% model-market agreement, 20% prediction certainty
    let modelMarketAgreement = 0.5;
    if (statsAnchors.implied_home_win != null && statsAnchors.poisson_home_win != null) {
      const maxPoissonDelta = Math.max(
        Math.abs(statsAnchors.poisson_home_win - statsAnchors.implied_home_win),
        Math.abs(statsAnchors.poisson_draw - statsAnchors.implied_draw),
        Math.abs(statsAnchors.poisson_away_win - statsAnchors.implied_away_win)
      );
      modelMarketAgreement = maxPoissonDelta < 0.05 ? 1.0 : maxPoissonDelta < 0.10 ? 0.8 : maxPoissonDelta < 0.15 ? 0.6 : 0.4;
    }

    // Prediction certainty: how decisive is the max probability
    const maxProb = Math.max(hw, dr, aw);
    const predictionCertainty = maxProb >= 0.55 ? 0.9 : maxProb >= 0.45 ? 0.7 : maxProb >= 0.38 ? 0.5 : 0.3;

    let blendedConfidence = (
      (dataQuality * 0.50) +
      (modelMarketAgreement * 0.30) +
      (predictionCertainty * 0.20)
    );

    // Apply AI confidence adjustment (clamped to -0.10 to +0.10)
    const confAdj = Math.max(-0.10, Math.min(0.10, pred.confidence_adjustment || 0));
    blendedConfidence = Math.round(Math.max(0.05, Math.min(0.95, blendedConfidence + confAdj)) * 1000) / 1000;

    // Enhanced best pick with value detection
    const bestPickResult = findBestPick(
      goalLines,
      hw, dr, aw,
      statsAnchors.implied_home_win ?? null, statsAnchors.implied_draw ?? null, statsAnchors.implied_away_win ?? null,
      statsAnchors.poisson_btts ?? null
    );

    await supabase.from("predictions").upsert({
      match_id: match_id,
      home_win: Math.round(hw * 1000) / 1000,
      draw: Math.round(dr * 1000) / 1000,
      away_win: Math.round(aw * 1000) / 1000,
      expected_goals_home: Math.round(lambdaH * 10) / 10,
      expected_goals_away: Math.round(lambdaA * 10) / 10,
      predicted_score_home: pred.predicted_score_home ?? null,
      predicted_score_away: pred.predicted_score_away ?? null,
      over_under_25: goalLines.over_2_5 > 0.5 ? "over" : "under",
      btts: pred.btts || "no",
      model_confidence: blendedConfidence,
      ai_reasoning: reasoning,
      goal_lines: goalLines,
      goal_distribution: goalDist,
      best_pick: bestPickResult.pick,
      best_pick_confidence: Math.round(bestPickResult.confidence * 1000) / 1000,
    }, { onConflict: "match_id" });

    await supabase.from("matches").update({ ai_insights: reasoning }).eq("id", match_id);

    return new Response(JSON.stringify({
      success: true,
      insights: reasoning,
      prediction: pred,
      statistical_anchors: statsAnchors,
      data_quality: Math.round(dataQuality * 100),
      validation_warnings: warnings,
      anomalies: pred.anomalies || [],
      momentum: { home: homeMomentum, away: awayMomentum },
      match_importance: importance,
      best_pick: bestPickResult,
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
