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
    const body = await req.json().catch(() => ({}));
    const { match_id, training_mode } = body as { match_id?: string; training_mode?: boolean };
    if (!match_id) {
      return new Response(JSON.stringify({ error: "match_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const isTraining = training_mode === true;

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

    // Fetch data in parallel (including model_performance for calibration + enrichment)
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
      { data: enrichment },
      { data: intelligence },
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
      supabase.from("model_performance").select("numeric_weights, error_weights, calibration_corrections, model_version").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("match_enrichment").select("*").eq("match_id", match_id).maybeSingle(),
      supabase.from("match_intelligence").select("confidence_adjustment, momentum_home, momentum_away").eq("match_id", match_id).maybeSingle(),
    ]);

    // Extract numeric calibration weights + error weights + calibration corrections
    const nw = (perfData as any)?.numeric_weights || {};
    const errorW = (perfData as any)?.error_weights || {};
    const calCorrections = (perfData as any)?.calibration_corrections || {};
    const homeBiasAdj: number = nw.home_bias_adjustment || 0;
    const drawCalAdj: number = nw.draw_calibration || 0;
    // P4: shape-conditional draw calibrations; positive values increase draw probability, negative values decrease it.
    const drawCalTight: number = nw.draw_calibration_tight || 0;
    const drawCalSkewed: number = nw.draw_calibration_skewed || 0;
    const ouLambdaAdj: number = nw.ou_lambda_adjustment || 0;
    const confDeflator: number = nw.confidence_deflator || 0;
    // Error-based adjustments
    const drawOverpredictPenalty: number = errorW.draw_overpredict_penalty || 0;
    const drawUnderpredictBoost: number = errorW.draw_underpredict_boost || 0;
    const overconfPenalty: number = errorW.overconfidence_penalty || 0;
    // League-specific weights (slug-based keys)
    const leagueSlug = match.league.replace(/\s/g, "_").toLowerCase();
    const leagueKey = `league_penalty_${leagueSlug}`;
    const leaguePenalty: number = nw[leagueKey] || 0;
    // P3: per-league lambda shifts learned from systematic over/under-scoring
    const leagueLambdaShiftHome: number = nw[`league_lambda_shift_home_${leagueSlug}`] || 0;
    const leagueLambdaShiftAway: number = nw[`league_lambda_shift_away_${leagueSlug}`] || 0;

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

    // Capture base lambdas BEFORE all adjustments for the ML feature snapshot.
    const baseLambdaHome = lambdaHome;
    const baseLambdaAway = lambdaAway;

    // ── H2H adjustment ──
    // If features contain h2h_results, adjust lambdas based on historical dominance
    let h2hHomeWins = 0, h2hAwayWins = 0, h2hDraws = 0, h2hCount = 0;
    if (features?.h2h_results && Array.isArray(features.h2h_results) && features.h2h_results.length >= 2) {
      const h2h = features.h2h_results as any[];
      h2hCount = h2h.length;
      for (const r of h2h) {
        if (r.score_home > r.score_away) {
          const homeTeamName = match.home_team?.name?.toLowerCase() || "";
          if (r.home?.toLowerCase().includes(homeTeamName.slice(0, 5))) h2hHomeWins++;
          else h2hAwayWins++;
        } else if (r.score_away > r.score_home) {
          const homeTeamName = match.home_team?.name?.toLowerCase() || "";
          if (r.away?.toLowerCase().includes(homeTeamName.slice(0, 5))) h2hHomeWins++;
          else h2hAwayWins++;
        } else {
          h2hDraws++;
        }
      }
      const h2hDominance = (h2hHomeWins - h2hAwayWins) / h2hCount;
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

    // P3: Per-league lambda shifts (learned, additive). These actually move the predicted side
    // unlike the old league_penalty_* which only deflated confidence.
    lambdaHome = lambdaHome + leagueLambdaShiftHome;
    lambdaAway = lambdaAway + leagueLambdaShiftAway;

    // ── Enrichment layer adjustments (additive, graceful fallback) ──
    let enrichmentApplied = false;
    if (enrichment) {
      enrichmentApplied = true;
      const enr = enrichment as any;

      // Key player absences: reduce lambda by 5% per missing player (capped at 15%)
      if (enr.key_player_missing_home >= 2) {
        const penalty = Math.min(0.15, enr.key_player_missing_home * 0.05);
        lambdaHome *= (1 - penalty);
      }
      if (enr.key_player_missing_away >= 2) {
        const penalty = Math.min(0.15, enr.key_player_missing_away * 0.05);
        lambdaAway *= (1 - penalty);
      }

      // News sentiment: strongly negative (< -0.5) reduces lambda by 3%
      if (enr.news_sentiment_home < -0.5) {
        lambdaHome *= 0.97;
      }
      if (enr.news_sentiment_away < -0.5) {
        lambdaAway *= 0.97;
      }

      // Weather impact: high impact reduces both lambdas (defensive conditions)
      if (enr.weather_impact > 0.7) {
        const weatherPenalty = enr.weather_impact * 0.05; // up to 5%
        lambdaHome *= (1 - weatherPenalty);
        lambdaAway *= (1 - weatherPenalty);
      }
    }

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

    // ── Graduated competition & stage adjustments ──
    const cupCompetitions = ["champions league", "europa league", "conference league", "world cup", "euro", "nations league"];
    const isCup = cupCompetitions.some(c => match.league.toLowerCase().includes(c));
    const matchStage = (match as any).match_stage || "regular";
    const matchImportanceVal = Number((match as any).match_importance) || 0.5;
    const competitionType = (match as any).competition_type || "league";

    // Stage-based lambda & draw adjustments (graduated, replaces binary isCup)
    if (matchStage === "final" || matchStage === "semi_final") {
      // Finals/semis: tighter, more defensive games
      lambdaHome *= 0.95;
      lambdaAway *= 0.95;
    } else if (matchStage === "quarter_final") {
      lambdaHome *= 0.97;
      lambdaAway *= 0.97;
    }

    // League strength reliability factor (scales confidence later)
    const leagueReliability: Record<string, number> = {
      "premier league": 1.0, "bundesliga": 1.0, "la liga": 0.95,
      "serie a": 0.95, "ligue 1": 0.9, "eredivisie": 0.85,
      "championship": 0.75, "keuken kampioen divisie": 0.7,
    };
    const leagueRelFactor = leagueReliability[match.league.toLowerCase()] ?? 0.85;

    // Championship special handling: 30% lambda regression toward league means
    if (match.league.toLowerCase().includes("championship") || match.league.toLowerCase().includes("keuken kampioen")) {
      const regressionFactor = 0.30;
      lambdaHome = lambdaHome * (1 - regressionFactor) + leagueHomeAvg * regressionFactor;
      lambdaAway = lambdaAway * (1 - regressionFactor) + leagueAwayAvg * regressionFactor;
    }

    // Relegation battle: more defensive
    if (matchImportanceVal >= 0.65 && matchStage === "regular") {
      const posH = features?.league_position_home;
      const posA = features?.league_position_away;
      if ((posH && posH >= 16) || (posA && posA >= 16)) {
        lambdaHome *= 0.95;
        lambdaAway *= 0.95;
      }
    }

    // Compute volatility score
    let refStrictness = 0.5;
    if (refereeData) {
      refStrictness = Math.min(1.0, (refereeData.yellow_avg || 3.5) / 5.0);
    }

    let teamAggression = 0.5;
    const hDisc = homeDiscipline;
    const aDisc = awayDiscipline;
    if (hDisc || aDisc) {
      const combinedYellow = ((hDisc?.yellow_avg || 1.5) + (aDisc?.yellow_avg || 1.5));
      teamAggression = Math.min(1.0, combinedYellow / 5.0);
    }

    const volatilityScore = Math.round(
      (refStrictness * 0.4 + teamAggression * 0.4 + matchImportanceVal * 0.2) * 1000
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
    // Net draw adjustment = learned draw_calibration + shape-conditional correction + error-based corrections.
    // P4: prefer shape-specific weight when available; falls back to global draw_calibration when zero.
    const lamDiffForCal = Math.abs(lambdaHome - lambdaAway);
    const shapeCal = lamDiffForCal < 0.4 ? drawCalTight : drawCalSkewed;
    const netDrawAdj = (shapeCal !== 0 ? shapeCal : drawCalAdj) + drawUnderpredictBoost - drawOverpredictPenalty;
    if (netDrawAdj !== 0) {
      poissonDR += netDrawAdj;
      const shift = netDrawAdj / 2;
      poissonHW -= shift;
      poissonAW -= shift;
    }

    // ── Enhanced draw boost when lambdas are close ──
    // When expected goals are similar, draws are more likely than raw Poisson suggests
    const lambdaDiff = Math.abs(lambdaHome - lambdaAway);
    if (lambdaDiff < 0.3) {
      const drawBoost = 0.06 * (1 - lambdaDiff / 0.3); // up to +6% when lambdas are equal
      poissonDR += drawBoost;
      poissonHW -= drawBoost * 0.5;
      poissonAW -= drawBoost * 0.5;
    } else if (lambdaDiff < 0.5) {
      const drawBoost = 0.03 * (1 - (lambdaDiff - 0.3) / 0.2); // up to +3%
      poissonDR += drawBoost;
      poissonHW -= drawBoost * 0.5;
      poissonAW -= drawBoost * 0.5;
    }

    // Graduated competition draw boost (replaces binary isCup +3%)
    {
      let stageDrawBoost = 0;
      if (matchStage === "final" || matchStage === "semi_final") stageDrawBoost = 0.05;
      else if (matchStage === "quarter_final") stageDrawBoost = 0.03;
      else if (isCup) stageDrawBoost = 0.02; // generic cup
      // Relegation battle draw boost
      if (matchImportanceVal >= 0.65 && matchStage === "regular") {
        const posH = features?.league_position_home;
        const posA = features?.league_position_away;
        if ((posH && posH >= 16) || (posA && posA >= 16)) stageDrawBoost += 0.03;
      }
      if (stageDrawBoost > 0) {
        const highest = poissonHW > poissonAW ? "home" : "away";
        if (highest === "home") poissonHW -= stageDrawBoost;
        else poissonAW -= stageDrawBoost;
        poissonDR += stageDrawBoost;
      }
    }

    // (Removed hardcoded globalDrawBoost — draw calibration is now fully learned via numeric_weights.draw_calibration + error_weights)

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

    // Apply confidence deflator from learning loop + error-based penalty + league penalty + league reliability
    // Use learned deflator with safety floor of -0.15 (no hardcoded override)
    const safeDeflator = Math.max(confDeflator - overconfPenalty, -0.15);
    const totalConfPenalty = volPenalty + Math.abs(safeDeflator) + Math.abs(leaguePenalty);

    // ── P2: Confidence redesign ──
    // Couple confidence to the actual probability mass of the top pick.
    // Old formula treated all picks equally regardless of how lopsided the probabilities were,
    // producing inverted calibration (high confidence → worse hit rate).
    // New formula: maxProb is the floor, scaled by league reliability and a data-quality multiplier
    // (which folds in market agreement). Penalties from learning still apply additively.
    const maxProb = Math.max(poissonHW, poissonDR, poissonAW);
    const dataQualityMult = 0.70 + 0.30 * dataQuality + 0.15 * (marketAgreement - 0.5); // ~[0.625, 1.075]
    const probConfidence = maxProb * leagueRelFactor * dataQualityMult;
    let rawConfidence = Math.round(Math.max(0.10, Math.min(0.90, probConfidence - totalConfPenalty)) * 1000) / 1000;

    // ── Per-bucket calibration correction ──
    // Apply bucket-specific correction based on where the raw confidence falls
    const confPct = Math.floor(rawConfidence * 100);
    const bucketKey = `${Math.floor(confPct / 10) * 10}-${Math.floor(confPct / 10) * 10 + 10}`;
    const bucketCorrection = calCorrections[bucketKey] || 0;
    let confidence = Math.round(Math.max(0.10, Math.min(0.95, rawConfidence + bucketCorrection)) * 1000) / 1000;

    // ── Football Intelligence Layer: apply confidence adjustment ──
    if (intelligence && typeof (intelligence as any).confidence_adjustment === "number") {
      const filAdj = Math.max(-0.1, Math.min(0.1, Number((intelligence as any).confidence_adjustment)));
      confidence = Math.round(Math.max(0.10, Math.min(0.95, confidence + filAdj)) * 1000) / 1000;
    }

    // Store volatility_score in match_features
    if (features) {
      await supabase.from("match_features").update({ volatility_score: volatilityScore }).eq("match_id", match_id);
    }

    const overUnder = goalLines.over_2_5 > 0.5 ? "over" : "under";
    const btts = poissonBtts >= 0.5 ? "yes" : "no";

    // ── P6: Publish gate ──
    // Hide predictions when the inputs are weak so displayed accuracy reflects only high-quality picks.
    // Triggers: dataQuality < 0.45, league reliability < 0.75, or final confidence below the floor.
    const qualityScore = Math.round(
      (0.55 * dataQuality + 0.30 * leagueRelFactor + 0.15 * Math.min(1, confidence / 0.6)) * 1000
    ) / 1000;
    const publishStatus =
      dataQuality < 0.45 || leagueRelFactor < 0.75 || confidence < 0.35
        ? "low_quality"
        : "published";

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
      publish_status: publishStatus,
      quality_score: qualityScore,
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
