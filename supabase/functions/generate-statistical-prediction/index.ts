import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function poissonPMF(lambda: number, k: number): number {
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) result *= lambda / i;
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

  // Only consider 2.5, 3.5, 4.5 goal lines — exclude trivial 0.5 and 1.5
  const allowedLines = ["over_2_5", "under_2_5", "over_3_5", "under_3_5", "over_4_5", "under_4_5"];
  for (const [k, v] of Object.entries(goalLines)) {
    if (!allowedLines.includes(k)) continue;
    if (v >= 0.55 && v <= 0.80) {
      const label = k.startsWith("over_")
        ? k.replace("over_", "Over ").replace("_", ".")
        : k.replace("under_", "Under ").replace("_", ".");
      candidates.push({ pick: label, confidence: v, edge: 0 });
    }
  }

  if (impliedHome != null) {
    const homeEdge = poissonHomeWin - impliedHome;
    const drawEdge = poissonDraw - (impliedDraw || 0);
    const awayEdge = poissonAwayWin - (impliedAway || 0);
    if (homeEdge > 0.05 && poissonHomeWin >= 0.4) candidates.push({ pick: "Home Win", confidence: poissonHomeWin, edge: homeEdge });
    if (drawEdge > 0.05 && poissonDraw >= 0.25) candidates.push({ pick: "Draw", confidence: poissonDraw, edge: drawEdge });
    if (awayEdge > 0.05 && poissonAwayWin >= 0.3) candidates.push({ pick: "Away Win", confidence: poissonAwayWin, edge: awayEdge });
  }

  if (poissonBtts != null && poissonBtts >= 0.55 && poissonBtts <= 0.80) {
    candidates.push({ pick: "BTTS Yes", confidence: poissonBtts, edge: 0 });
  }

  candidates.sort((a, b) => (b.edge || 0) - (a.edge || 0) || b.confidence - a.confidence);
  if (candidates.length > 0) return candidates[0];
  return {
    pick: goalLines.over_2_5 > 0.5 ? "Over 2.5" : "Under 2.5",
    confidence: Math.max(goalLines.over_2_5, goalLines.under_2_5),
    edge: 0,
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
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch match
    const { data: match } = await supabase
      .from("matches")
      .select("*, home_team:teams!matches_team_home_id_fkey(*), away_team:teams!matches_team_away_id_fkey(*)")
      .eq("id", match_id)
      .single();

    if (!match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch data in parallel (including model_performance for calibration)
    const [
      { data: odds },
      { data: features },
      { data: homeMatches },
      { data: awayMatches },
      { data: leagueMatches },
      { data: refereeData },
      { data: homeDiscipline },
      { data: awayDiscipline },
      { data: perfData },
    ] = await Promise.all([
      supabase.from("odds").select("*").eq("match_id", match_id).single(),
      supabase.from("match_features").select("*").eq("match_id", match_id).single(),
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .or(`team_home_id.eq.${match.team_home_id},team_away_id.eq.${match.team_home_id}`)
        .eq("status", "completed").order("match_date", { ascending: false }).limit(20),
      supabase.from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .or(`team_home_id.eq.${match.team_away_id},team_away_id.eq.${match.team_away_id}`)
        .eq("status", "completed").order("match_date", { ascending: false }).limit(20),
      supabase.from("matches")
        .select("goals_home, goals_away, league")
        .eq("league", match.league).eq("status", "completed")
        .order("match_date", { ascending: false }).limit(200),
      match.referee ? supabase.from("referees").select("*").eq("name", match.referee).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("team_discipline").select("*").eq("team_id", match.team_home_id).order("season", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("team_discipline").select("*").eq("team_id", match.team_away_id).order("season", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("model_performance").select("numeric_weights").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    // Extract numeric calibration weights
    const nw = (perfData as any)?.numeric_weights || {};
    const homeBiasAdj: number = nw.home_bias_adjustment || 0;
    const drawCalAdj: number = nw.draw_calibration || 0;
    const ouLambdaAdj: number = nw.ou_lambda_adjustment || 0;
    const confDeflator: number = nw.confidence_deflator || 0;
    // League-specific penalty
    const leagueKey = `league_penalty_${match.league.replace(/\s/g, "_").toLowerCase()}`;
    const leaguePenalty: number = nw[leagueKey] || 0;

    // Compute league averages
    const leagueComplete = (leagueMatches || []).filter((m: any) => m.goals_home != null);
    let leagueHomeAvg = 1.45, leagueAwayAvg = 1.15;
    if (leagueComplete.length >= 10) {
      let hg = 0, ag = 0;
      for (const m of leagueComplete) { hg += m.goals_home ?? 0; ag += m.goals_away ?? 0; }
      leagueHomeAvg = Math.round((hg / leagueComplete.length) * 100) / 100;
      leagueAwayAvg = Math.round((ag / leagueComplete.length) * 100) / 100;
    }

    // Compute team stats with exponential weighting
    function calcStats(matches: any[], teamId: string) {
      if (!matches || matches.length === 0) return null;
      let scored = 0, conceded = 0, cleanSheets = 0, bttsCount = 0;
      let wScored = 0, wConceded = 0, wTotal = 0;
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        const isHome = m.team_home_id === teamId;
        const gf = isHome ? (m.goals_home ?? 0) : (m.goals_away ?? 0);
        const ga = isHome ? (m.goals_away ?? 0) : (m.goals_home ?? 0);
        scored += gf; conceded += ga;
        if (ga === 0) cleanSheets++;
        if (gf > 0 && ga > 0) bttsCount++;
        const w = Math.pow(0.85, i);
        wScored += gf * w; wConceded += ga * w; wTotal += w;
      }
      const played = matches.length;
      return {
        played,
        avgScored: scored / played,
        avgConceded: conceded / played,
        wAvgScored: Math.min(wScored / wTotal, 5.0),
        wAvgConceded: Math.min(wConceded / wTotal, 5.0),
        cleanSheets: Math.min(cleanSheets, played),
        bttsRate: bttsCount / played,
      };
    }

    const homeStats = calcStats(homeMatches || [], match.team_home_id);
    const awayStats = calcStats(awayMatches || [], match.team_away_id);

    // Use features if available, otherwise compute from stats
    let lambdaHome: number, lambdaAway: number;

    if (features?.poisson_xg_home && Number(features.poisson_xg_home) > 0) {
      lambdaHome = Number(features.poisson_xg_home);
      lambdaAway = Number(features.poisson_xg_away);
    } else if (homeStats && awayStats) {
      const leagueAvg = (leagueHomeAvg + leagueAwayAvg) / 2;
      const homeAtk = homeStats.wAvgScored / leagueAvg;
      const awayDefW = awayStats.wAvgConceded / leagueAvg;
      const awayAtk = awayStats.wAvgScored / leagueAvg;
      const homeDefW = homeStats.wAvgConceded / leagueAvg;
      lambdaHome = Math.round(homeAtk * awayDefW * leagueHomeAvg * 100) / 100;
      lambdaAway = Math.round(awayAtk * homeDefW * leagueAwayAvg * 100) / 100;
    } else {
      lambdaHome = leagueHomeAvg;
      lambdaAway = leagueAwayAvg;
    }

    // ── H2H adjustment ──
    // If features contain h2h_results, adjust lambdas based on historical dominance
    if (features?.h2h_results && Array.isArray(features.h2h_results) && features.h2h_results.length >= 2) {
      const h2h = features.h2h_results as any[];
      let homeWins = 0, awayWins = 0;
      for (const r of h2h) {
        if (r.score_home > r.score_away) {
          // Check if the current home team was also home in this H2H match
          const homeTeamName = match.home_team?.name?.toLowerCase() || "";
          if (r.home?.toLowerCase().includes(homeTeamName.slice(0, 5))) homeWins++;
          else awayWins++;
        } else if (r.score_away > r.score_home) {
          const homeTeamName = match.home_team?.name?.toLowerCase() || "";
          if (r.away?.toLowerCase().includes(homeTeamName.slice(0, 5))) homeWins++;
          else awayWins++;
        }
      }
      const totalH2H = h2h.length;
      const h2hDominance = (homeWins - awayWins) / totalH2H; // -1 to +1
      // Apply ±5% lambda adjustment based on H2H dominance
      const h2hAdj = h2hDominance * 0.05;
      lambdaHome = lambdaHome * (1 + h2hAdj);
      lambdaAway = lambdaAway * (1 - h2hAdj);
    }

    // ── League position adjustment ──
    // Larger position gaps = boost favorite's lambda slightly
    if (features?.position_diff != null && features.position_diff !== 0) {
      const posDiff = Number(features.position_diff); // negative = home team higher (better)
      // Cap effect at ±5% for a 10+ position gap
      const posAdj = Math.max(-0.05, Math.min(0.05, -posDiff * 0.005));
      lambdaHome = lambdaHome * (1 + posAdj);
      lambdaAway = lambdaAway * (1 - posAdj);
    }

    // Apply O/U calibration adjustment to lambdas
    lambdaHome = lambdaHome + ouLambdaAdj;
    lambdaAway = lambdaAway + ouLambdaAdj;

    // Ensure reasonable bounds
    lambdaHome = Math.max(0.3, Math.min(lambdaHome, 4.0));
    lambdaAway = Math.max(0.3, Math.min(lambdaAway, 4.0));

    // Compute 1X2 probabilities
    let poissonHW = 0, poissonDR = 0, poissonAW = 0;
    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        const p = poissonPMF(lambdaHome, h) * poissonPMF(lambdaAway, a);
        if (h > a) poissonHW += p;
        else if (h === a) poissonDR += p;
        else poissonAW += p;
      }
    }

    // ── Volatility adjustments ──
    const cupCompetitions = ["champions league", "europa league", "conference league", "world cup", "euro", "nations league"];
    const isCup = cupCompetitions.some(c => match.league.toLowerCase().includes(c));

    // Compute volatility score
    let refStrictness = 0.5; // neutral default
    if (refereeData) {
      // Normalize: league avg ~3.5 yellows/match
      refStrictness = Math.min(1.0, (refereeData.yellow_avg || 3.5) / 5.0);
    }

    let teamAggression = 0.5;
    const hDisc = homeDiscipline;
    const aDisc = awayDiscipline;
    if (hDisc || aDisc) {
      const combinedYellow = ((hDisc?.yellow_avg || 1.5) + (aDisc?.yellow_avg || 1.5));
      teamAggression = Math.min(1.0, combinedYellow / 5.0);
    }

    const matchImportance = isCup ? 1.0 : 0.5;
    const volatilityScore = Math.round(
      (refStrictness * 0.4 + teamAggression * 0.4 + matchImportance * 0.2) * 1000
    ) / 1000;

    // Goal lines & distribution (computed before volatility adjustments)
    const goalLines = computeGoalLines(lambdaHome, lambdaAway);
    const goalDist = computeGoalDistribution(lambdaHome, lambdaAway);

    // Apply volatility adjustments (capped at ±5%)
    if (volatilityScore > 0.6) {
      const volAdjust = Math.min(0.05, (volatilityScore - 0.5) * 0.10);
      // High volatility: slightly increase over probability, increase draw
      goalLines.over_2_5 = Math.min(0.95, goalLines.over_2_5 + volAdjust * 0.5);
      goalLines.under_2_5 = Math.max(0.05, 1 - goalLines.over_2_5);
    }

    // Apply home bias calibration from learning loop
    if (homeBiasAdj !== 0) {
      poissonHW += homeBiasAdj;
      poissonAW -= homeBiasAdj * 0.5;
      poissonDR -= homeBiasAdj * 0.5;
    }

    // Apply draw calibration from learning loop
    if (drawCalAdj !== 0) {
      poissonDR += drawCalAdj;
      const shift = drawCalAdj / 2;
      poissonHW -= shift;
      poissonAW -= shift;
    }

    // Competition-specific adjustments (cup draw boost)
    if (isCup) {
      const boost = 0.03;
      const highest = poissonHW > poissonAW ? "home" : "away";
      if (highest === "home") poissonHW -= boost;
      else poissonAW -= boost;
      poissonDR += boost;
    }

    // High volatility: reduce favorite margin slightly, increase draw
    if (volatilityScore > 0.65) {
      const volBoost = Math.min(0.02, (volatilityScore - 0.65) * 0.06);
      const highest2 = poissonHW > poissonAW ? "home" : "away";
      if (highest2 === "home") poissonHW -= volBoost;
      else poissonAW -= volBoost;
      poissonDR += volBoost;
    }

    // Normalize after adjustments
    const totalP = poissonHW + poissonDR + poissonAW;
    poissonHW /= totalP;
    poissonDR /= totalP;
    poissonAW /= totalP;

    // BTTS
    const homeScoringRate = 1 - poissonPMF(lambdaHome, 0);
    const awayScoringRate = 1 - poissonPMF(lambdaAway, 0);
    const poissonBtts = homeScoringRate * awayScoringRate;

    // (goalLines & goalDist already computed above, before volatility adjustments)

    // Predicted score = most probable scoreline, enforcing consistency with 1X2
    let bestScore = { h: 1, a: 1, p: 0 };
    let bestScoreHW = { h: 1, a: 0, p: 0 };
    let bestScoreAW = { h: 0, a: 1, p: 0 };
    let bestScoreDR = { h: 0, a: 0, p: 0 };
    for (let h = 0; h <= 5; h++) {
      for (let a = 0; a <= 5; a++) {
        const p = poissonPMF(lambdaHome, h) * poissonPMF(lambdaAway, a);
        if (p > bestScore.p) bestScore = { h, a, p };
        if (h > a && p > bestScoreHW.p) bestScoreHW = { h, a, p };
        if (a > h && p > bestScoreAW.p) bestScoreAW = { h, a, p };
        if (h === a && p > bestScoreDR.p) bestScoreDR = { h, a, p };
      }
    }

    // Enforce: predicted score must match predicted outcome
    if (poissonHW > poissonDR && poissonHW > poissonAW && bestScore.h <= bestScore.a) {
      bestScore = bestScoreHW;
    } else if (poissonAW > poissonHW && poissonAW > poissonDR && bestScore.a <= bestScore.h) {
      bestScore = bestScoreAW;
    } else if (poissonDR > poissonHW && poissonDR > poissonAW && bestScore.h !== bestScore.a) {
      bestScore = bestScoreDR;
    }

    // Implied probabilities from odds
    let impliedHome: number | null = null, impliedDraw: number | null = null, impliedAway: number | null = null;
    if (odds) {
      const h = 1 / odds.home_win_odds, d = 1 / odds.draw_odds, a = 1 / odds.away_win_odds;
      const t = h + d + a;
      impliedHome = h / t; impliedDraw = d / t; impliedAway = a / t;
    }

    // Best pick with value detection
    const bestPickResult = findBestPick(goalLines, poissonHW, poissonDR, poissonAW, impliedHome, impliedDraw, impliedAway, poissonBtts);

    // Data quality confidence
    const hasOdds = !!odds;
    const hasFeatures = !!features;
    const hasStats = homeStats != null && awayStats != null;
    const formCount = Math.min((homeStats?.played || 0), 5);
    const dataQuality = (
      0.25 * Math.min(formCount / 5, 1) +
      0.20 * (hasOdds ? 1 : 0) +
      0.20 * (hasFeatures ? 1 : 0) +
      0.20 * (hasStats ? 1 : 0) +
      0.15 * (leagueComplete.length >= 30 ? 1 : leagueComplete.length / 30)
    );

    // Model-market agreement boosts confidence
    let marketAgreement = 0.5;
    if (impliedHome != null) {
      const maxDelta = Math.max(
        Math.abs(poissonHW - impliedHome),
        Math.abs(poissonDR - (impliedDraw || 0)),
        Math.abs(poissonAW - (impliedAway || 0))
      );
      marketAgreement = maxDelta < 0.05 ? 1.0 : maxDelta < 0.10 ? 0.8 : maxDelta < 0.15 ? 0.6 : 0.4;
    }

    // Volatility penalty on confidence
    let volPenalty = 0;
    if (volatilityScore > 0.65) volPenalty = Math.min(0.05, (volatilityScore - 0.65) * 0.15);

    // Apply confidence deflator from learning loop + league penalty
    const totalConfPenalty = volPenalty + Math.abs(confDeflator) + Math.abs(leaguePenalty);
    const confidence = Math.round(Math.max(0.10, (dataQuality * 0.6 + marketAgreement * 0.4) - totalConfPenalty) * 1000) / 1000;

    // Store volatility_score in match_features
    if (features) {
      await supabase.from("match_features").update({ volatility_score: volatilityScore }).eq("match_id", match_id);
    }

    const overUnder = goalLines.over_2_5 > 0.5 ? "over" : "under";
    const btts = poissonBtts >= 0.5 ? "yes" : "no";

    // Upsert prediction
    const { error: upsertErr } = await supabase.from("predictions").upsert({
      match_id,
      home_win: Math.round(poissonHW * 1000) / 1000,
      draw: Math.round(poissonDR * 1000) / 1000,
      away_win: Math.round(poissonAW * 1000) / 1000,
      expected_goals_home: Math.round(lambdaHome * 10) / 10,
      expected_goals_away: Math.round(lambdaAway * 10) / 10,
      predicted_score_home: bestScore.h,
      predicted_score_away: bestScore.a,
      over_under_25: overUnder,
      btts,
      model_confidence: confidence,
      goal_lines: goalLines,
      goal_distribution: goalDist,
      best_pick: bestPickResult.pick,
      best_pick_confidence: Math.round(bestPickResult.confidence * 1000) / 1000,
      last_prediction_at: new Date().toISOString(),
    }, { onConflict: "match_id" });

    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({
      success: true,
      match_id,
      prediction: {
        home_win: Math.round(poissonHW * 1000) / 1000,
        draw: Math.round(poissonDR * 1000) / 1000,
        away_win: Math.round(poissonAW * 1000) / 1000,
        expected_goals_home: Math.round(lambdaHome * 10) / 10,
        expected_goals_away: Math.round(lambdaAway * 10) / 10,
        predicted_score: `${bestScore.h}-${bestScore.a}`,
        over_under_25: overUnder,
        btts,
        best_pick: bestPickResult.pick,
        confidence,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Statistical prediction error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
