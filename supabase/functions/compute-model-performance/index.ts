import { createClient } from "npm:@supabase/supabase-js@2";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let forceRecompute = false;
    try {
      const body = await req.json();
      forceRecompute = body?.force === true;
    } catch { /* no body, that's fine */ }

    const { data: latestPerf } = await supabase
      .from("model_performance")
      .select("total_matches, last_learning_match_count, model_version, numeric_weights, error_weights, calibration_corrections")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevVersion = (latestPerf as any)?.model_version || 0;
    const prevMatchCount = (latestPerf as any)?.last_learning_match_count || 0;
    const prevWeights = (latestPerf as any)?.numeric_weights || {};

    const { data: matches, error: mErr } = await supabase
      .from("matches")
      .select("id, goals_home, goals_away, match_date, league, team_home_id, team_away_id, match_importance")
      .eq("status", "completed")
      .order("match_date", { ascending: false })
      .limit(1000);

    if (mErr) throw mErr;
    if (!matches || matches.length === 0) {
      return new Response(JSON.stringify({ message: "No completed matches" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentTotal = matches.length;

    if (!forceRecompute && prevMatchCount > 0 && (currentTotal - prevMatchCount) < 50) {
      return new Response(JSON.stringify({
        message: "Learning cycle not triggered",
        current_matches: currentTotal,
        last_learning_at: prevMatchCount,
        next_trigger_at: prevMatchCount + 50,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const matchIds = matches.map((m: any) => m.id);

    const chunkSize = 200;
    const allPredictions: any[] = [];
    const allFeatures: any[] = [];
    const allReviews: any[] = [];
    for (let i = 0; i < matchIds.length; i += chunkSize) {
      const chunk = matchIds.slice(i, i + chunkSize);
      const [{ data: preds, error: pErr }, { data: feats }, { data: revs }] = await Promise.all([
        supabase.from("predictions").select("*").in("match_id", chunk),
        supabase.from("match_features").select("*").in("match_id", chunk),
        supabase.from("prediction_reviews").select("*").in("match_id", chunk),
      ]);
      if (pErr) throw pErr;
      if (preds) allPredictions.push(...preds);
      if (feats) allFeatures.push(...feats);
      if (revs) allReviews.push(...revs);
    }

    const predictions = allPredictions;
    if (predictions.length === 0) {
      return new Response(JSON.stringify({ message: "No predictions found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const predMap = new Map(predictions.map((p: any) => [p.match_id, p]));
    const featMap = new Map(allFeatures.map((f: any) => [f.match_id, f]));
    const reviewMap = new Map(allReviews.map((r: any) => [r.match_id, r]));

    const now = Date.now();
    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
    function getTemporalWeight(matchDate: string, matchImportance: number | null): number {
      const weeksAgo = Math.max(0, (now - new Date(matchDate).getTime()) / MS_PER_WEEK);
      const timeDecay = Math.pow(0.95, weeksAgo);
      const importanceMult = (matchImportance != null && matchImportance > 0.7) ? 1.5 : 1.0;
      const agePenalty = weeksAgo > 8.57 ? 0.7 : 1.0;
      return timeDecay * importanceMult * agePenalty;
    }

    let totalW = 0, outcomeCorrectW = 0, ou25CorrectW = 0, bttsCorrectW = 0;
    let total = 0, outcomeCorrect = 0, ou25Correct = 0, bttsCorrect = 0, exactScoreHits = 0;
    let totalBrier1x2 = 0, totalBrierOu = 0, totalBrierBtts = 0, totalMaeGoals = 0;
    const calibrationBuckets: Record<string, { predicted: number; actual: number; count: number }> = {};
    const goalLineHits: Record<string, { correct: number; total: number }> = {};
    const weaknesses: string[] = [];

    let formCorrectCount = 0, formTotalCount = 0;
    let homeAdvCorrectCount = 0, homeAdvTotalCount = 0;
    let highConfCorrectCount = 0, highConfTotalCount = 0;
    let lowConfCorrectCount = 0, lowConfTotalCount = 0;
    const leagueAccuracy: Record<string, { correct: number; total: number; correctW: number; totalW: number }> = {};

    for (let i = 0; i < 10; i++) {
      calibrationBuckets[`${i * 10}-${(i + 1) * 10}`] = { predicted: 0, actual: 0, count: 0 };
    }
    for (const line of ["0_5", "1_5", "2_5", "3_5", "4_5"]) {
      goalLineHits[`over_${line}`] = { correct: 0, total: 0 };
      goalLineHits[`under_${line}`] = { correct: 0, total: 0 };
    }

    for (const match of matches) {
      const pred = predMap.get(match.id);
      if (!pred) continue;

      const w = getTemporalWeight(match.match_date, match.match_importance);
      total++;
      totalW += w;
      const gh = match.goals_home!;
      const ga = match.goals_away!;
      const totalGoals = gh + ga;
      const feat = featMap.get(match.id);

      const actualHome = gh > ga;
      const actualDraw = gh === ga;
      const actualAway = ga > gh;
      const hw = Number(pred.home_win) || 0;
      const dr = Number(pred.draw) || 0;
      const aw = Number(pred.away_win) || 0;
      const predHome = hw > dr && hw > aw;
      const predDraw = dr >= hw && dr >= aw && !predHome;

      const outcomeHit = (actualHome && predHome) || (actualDraw && predDraw) || (actualAway && !predHome && !predDraw);
      if (outcomeHit) { outcomeCorrect++; outcomeCorrectW += w; }

      const predOver = pred.over_under_25 === "over";
      if ((totalGoals > 2.5 && predOver) || (totalGoals <= 2.5 && !predOver)) {
        ou25Correct++; ou25CorrectW += w;
      }

      const actualBtts = gh > 0 && ga > 0;
      const predBtts = pred.btts === "yes";
      if (actualBtts === predBtts) { bttsCorrect++; bttsCorrectW += w; }

      if (pred.predicted_score_home === gh && pred.predicted_score_away === ga) exactScoreHits++;

      totalBrier1x2 += Math.pow(hw - (actualHome ? 1 : 0), 2) + Math.pow(dr - (actualDraw ? 1 : 0), 2) + Math.pow(aw - (actualAway ? 1 : 0), 2);
      totalBrierOu += Math.pow((predOver ? 1 : 0) - (totalGoals > 2.5 ? 1 : 0), 2);
      totalBrierBtts += Math.pow((predBtts ? 1 : 0) - (actualBtts ? 1 : 0), 2);
      totalMaeGoals += Math.abs((Number(pred.expected_goals_home) || 0) - gh) + Math.abs((Number(pred.expected_goals_away) || 0) - ga);

      const maxProb = Math.max(hw, dr, aw);
      const bucket = Math.min(Math.floor(maxProb * 10), 9);
      const bucketKey = `${bucket * 10}-${(bucket + 1) * 10}`;
      calibrationBuckets[bucketKey].predicted += maxProb;
      calibrationBuckets[bucketKey].actual += outcomeHit ? 1 : 0;
      calibrationBuckets[bucketKey].count++;

      if (pred.goal_lines) {
        const gl = pred.goal_lines as Record<string, number>;
        for (const t of [0.5, 1.5, 2.5, 3.5, 4.5]) {
          const key = t.toString().replace(".", "_");
          const overKey = `over_${key}`;
          const underKey = `under_${key}`;
          if (gl[overKey] != null) {
            goalLineHits[overKey].total++;
            const predictedOver = gl[overKey] > 0.5;
            if ((totalGoals > t && predictedOver) || (totalGoals <= t && !predictedOver)) goalLineHits[overKey].correct++;
          }
          if (gl[underKey] != null) {
            goalLineHits[underKey].total++;
            const predictedUnder = gl[underKey] > 0.5;
            if ((totalGoals <= t && predictedUnder) || (totalGoals > t && !predictedUnder)) goalLineHits[underKey].correct++;
          }
        }
      }

      if (feat?.home_form_last5 && feat?.away_form_last5) {
        const homeFormWins = (feat.home_form_last5 as string).split("").filter((c: string) => c === "W").length;
        const awayFormWins = (feat.away_form_last5 as string).split("").filter((c: string) => c === "W").length;
        if (homeFormWins !== awayFormWins) {
          formTotalCount++;
          if ((homeFormWins > awayFormWins && actualHome) || (homeFormWins < awayFormWins && actualAway)) formCorrectCount++;
        }
      }

      homeAdvTotalCount++;
      if (actualHome) homeAdvCorrectCount++;

      const conf = Number(pred.model_confidence) || 0;
      if (conf >= 0.65) { highConfTotalCount++; if (outcomeHit) highConfCorrectCount++; }
      else if (conf <= 0.45) { lowConfTotalCount++; if (outcomeHit) lowConfCorrectCount++; }

      const league = match.league || "Unknown";
      if (!leagueAccuracy[league]) leagueAccuracy[league] = { correct: 0, total: 0, correctW: 0, totalW: 0 };
      leagueAccuracy[league].total++;
      leagueAccuracy[league].totalW += w;
      if (outcomeHit) { leagueAccuracy[league].correct++; leagueAccuracy[league].correctW += w; }
    }

    if (total === 0) {
      return new Response(JSON.stringify({ message: "No matched predictions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const outcomeAcc = Math.round((outcomeCorrect / total) * 1000) / 10;
    const ou25Acc = Math.round((ou25Correct / total) * 1000) / 10;
    const bttsAcc = Math.round((bttsCorrect / total) * 1000) / 10;
    const avgBrier1x2 = Math.round((totalBrier1x2 / total) * 1000) / 1000;
    const avgBrierOu = Math.round((totalBrierOu / total) * 1000) / 1000;
    const avgBrierBtts = Math.round((totalBrierBtts / total) * 1000) / 1000;
    const mae = Math.round((totalMaeGoals / total) * 100) / 100;

    const calibration: Record<string, { avg_predicted: number; actual_rate: number; count: number }> = {};
    for (const [key, val] of Object.entries(calibrationBuckets)) {
      if (val.count > 0) {
        calibration[key] = {
          avg_predicted: Math.round((val.predicted / val.count) * 1000) / 1000,
          actual_rate: Math.round((val.actual / val.count) * 1000) / 1000,
          count: val.count,
        };
      }
    }

    const glAccuracy: Record<string, number> = {};
    for (const [key, val] of Object.entries(goalLineHits)) {
      if (val.total > 0) glAccuracy[key] = Math.round((val.correct / val.total) * 1000) / 10;
    }

    const featureWeights: Record<string, string> = {};
    if (formTotalCount >= 10) {
      const formAcc = Math.round((formCorrectCount / formTotalCount) * 100);
      featureWeights["form"] = formAcc > 60 ? `Strong predictor (${formAcc}%)` : formAcc < 40 ? `Weak predictor (${formAcc}%)` : `Moderate (${formAcc}%)`;
    }
    if (homeAdvTotalCount >= 20) {
      const homeWinRate = Math.round((homeAdvCorrectCount / homeAdvTotalCount) * 100);
      featureWeights["home_advantage"] = `Home wins ${homeWinRate}% of matches`;
    }
    if (highConfTotalCount >= 5) {
      const hca = Math.round((highConfCorrectCount / highConfTotalCount) * 100);
      featureWeights["confidence_calibration"] = `High-conf (≥65%) hits ${hca}% (${highConfTotalCount} matches)${hca < 55 ? " — OVERCONFIDENT" : ""}`;
    }
    if (lowConfTotalCount >= 5) {
      const lca = Math.round((lowConfCorrectCount / lowConfTotalCount) * 100);
      featureWeights["low_confidence_check"] = `Low-conf (≤45%) hits ${lca}% (${lowConfTotalCount} matches)${lca > 45 ? " — UNDERCONFIDENT" : ""}`;
    }
    for (const [league, data] of Object.entries(leagueAccuracy)) {
      if (data.total >= 10) {
        const acc = Math.round((data.correct / data.total) * 100);
        if (acc < 35) {
          featureWeights[`league_${league.replace(/\s/g, "_")}`] = `Poor (${acc}% over ${data.total})`;
          weaknesses.push(`Low accuracy in ${league}: ${acc}% over ${data.total} matches`);
        } else if (acc > 60) {
          featureWeights[`league_${league.replace(/\s/g, "_")}`] = `Strong (${acc}% over ${data.total})`;
        }
      }
    }

    if (outcomeAcc < 45) weaknesses.push(`1X2 accuracy is low at ${outcomeAcc}%`);
    if (ou25Acc < 50) weaknesses.push(`O/U 2.5 accuracy is ${ou25Acc}%`);
    if (bttsAcc < 50) weaknesses.push(`BTTS accuracy is ${bttsAcc}%`);
    if (mae > 2.0) weaknesses.push(`MAE for goals is ${mae}`);
    for (const [key, val] of Object.entries(calibration)) {
      const gap = Math.abs(val.avg_predicted - val.actual_rate);
      if (gap > 0.15 && val.count >= 10) {
        weaknesses.push(`${val.avg_predicted > val.actual_rate ? "Over" : "Under"}confident in ${key}% range`);
      }
    }
    for (const [key, acc] of Object.entries(glAccuracy)) {
      if (acc < 45) weaknesses.push(`${key.replace("_", " ").replace("_", ".")} weak at ${acc}%`);
    }

    const numericWeights: Record<string, number> = {};

    if (homeAdvTotalCount >= 20) {
      const homeWinRate = homeAdvCorrectCount / homeAdvTotalCount;
      if (homeWinRate < 0.40) numericWeights.home_bias_adjustment = -0.03;
      else if (homeWinRate > 0.55) numericWeights.home_bias_adjustment = 0.02;
      else numericWeights.home_bias_adjustment = 0;
    }

    let drawPredCountW = 0, drawCorrectCountW = 0, actualDrawCountW = 0;
    for (const match of matches) {
      const pred = predMap.get(match.id);
      if (!pred) continue;
      const w = getTemporalWeight(match.match_date, match.match_importance);
      const hw = Number(pred.home_win) || 0;
      const dr = Number(pred.draw) || 0;
      const aw = Number(pred.away_win) || 0;
      const isDraw = match.goals_home === match.goals_away;
      if (isDraw) actualDrawCountW += w;
      const predDraw = dr >= hw && dr >= aw;
      if (predDraw) {
        drawPredCountW += w;
        if (isDraw) drawCorrectCountW += w;
      }
    }
    const actualDrawRate = totalW > 0 ? actualDrawCountW / totalW : 0.26;
    const predDrawRate = totalW > 0 ? drawPredCountW / totalW : 0.26;
    numericWeights.draw_calibration = Math.round(Math.max(-0.05, Math.min(0.05, (actualDrawRate - predDrawRate))) * 1000) / 1000;

    if (ou25Acc < 48) {
      let predOverCountW = 0, actualOverCountW = 0;
      for (const match of matches) {
        const pred = predMap.get(match.id);
        if (!pred) continue;
        const w = getTemporalWeight(match.match_date, match.match_importance);
        if (pred.over_under_25 === "over") predOverCountW += w;
        if ((match.goals_home ?? 0) + (match.goals_away ?? 0) > 2.5) actualOverCountW += w;
      }
      const overBias = totalW > 0 ? (predOverCountW - actualOverCountW) / totalW : 0;
      numericWeights.ou_lambda_adjustment = Math.round(Math.max(-0.15, Math.min(0.15, -overBias * 0.3)) * 1000) / 1000;
    } else {
      numericWeights.ou_lambda_adjustment = 0;
    }

    if (highConfTotalCount >= 5) {
      const highConfAcc = highConfCorrectCount / highConfTotalCount;
      if (highConfAcc < 0.55) {
        numericWeights.confidence_deflator = Math.round(Math.max(-0.15, (highConfAcc - 0.65) * 0.5) * 1000) / 1000;
      } else {
        numericWeights.confidence_deflator = 0;
      }
    }

    for (const [league, data] of Object.entries(leagueAccuracy)) {
      if (data.total >= 10) {
        const wAcc = data.totalW > 0 ? data.correctW / data.totalW : 0;
        if (wAcc < 0.35) {
          numericWeights[`league_penalty_${league.replace(/\s/g, "_").toLowerCase()}`] = Math.round((0.35 - wAcc) * -1 * 1000) / 1000;
        }
      }
    }

    const errorWeights: Record<string, number> = {};
    if (allReviews.length > 0) {
      const errorCounts: Record<string, number> = {};
      let totalErrors = 0;
      for (const rev of allReviews) {
        if (rev.error_type && !rev.outcome_correct) {
          errorCounts[rev.error_type] = (errorCounts[rev.error_type] || 0) + 1;
          totalErrors++;
        }
      }
      if (totalErrors > 0) {
        const falseDraw = (errorCounts["false_draw"] || 0) / totalErrors;
        const missedDraw = (errorCounts["missed_draw"] || 0) / totalErrors;
        const overconfHome = (errorCounts["overconfident_home"] || 0) / totalErrors;
        const overconfAway = (errorCounts["overconfident_away"] || 0) / totalErrors;

        if (falseDraw > 0.25) errorWeights.draw_overpredict_penalty = Math.round(Math.min(0.05, (falseDraw - 0.25) * 0.2) * 1000) / 1000;
        else errorWeights.draw_overpredict_penalty = 0;

        if (missedDraw > 0.20) errorWeights.draw_underpredict_boost = Math.round(Math.min(0.05, (missedDraw - 0.20) * 0.2) * 1000) / 1000;
        else errorWeights.draw_underpredict_boost = 0;

        if ((overconfHome + overconfAway) > 0.10) errorWeights.overconfidence_penalty = Math.round(Math.min(0.05, ((overconfHome + overconfAway) - 0.10) * 0.3) * 1000) / 1000;
        else errorWeights.overconfidence_penalty = 0;
      }
    }

    const calibrationCorrections: Record<string, number> = {};
    for (const [key, val] of Object.entries(calibration)) {
      if (val.count >= 5) {
        const correction = Math.round((val.actual_rate - val.avg_predicted) * 1000) / 1000;
        calibrationCorrections[key] = Math.max(-0.15, Math.min(0.15, correction));
      }
    }

    const recentMatches = matches.slice(0, 30);
    let newCorrect = 0, oldCorrect = 0, recentValid = 0;
    for (const match of recentMatches) {
      const pred = predMap.get(match.id);
      if (!pred) continue;
      recentValid++;
      const gh = match.goals_home!;
      const ga = match.goals_away!;
      const actualHome = gh > ga;
      const actualDraw = gh === ga;
      const hw = Number(pred.home_win) || 0;
      const dr = Number(pred.draw) || 0;
      const aw = Number(pred.away_win) || 0;

      let adjDr = dr + (numericWeights.draw_calibration || 0);
      let adjHw = hw + (numericWeights.home_bias_adjustment || 0) - (numericWeights.draw_calibration || 0) / 2;
      let adjAw = aw - (numericWeights.home_bias_adjustment || 0) * 0.5 - (numericWeights.draw_calibration || 0) / 2;
      const t1 = adjHw + adjDr + adjAw;
      adjHw /= t1; adjDr /= t1; adjAw /= t1;
      const newPredHome = adjHw > adjDr && adjHw > adjAw;
      const newPredDraw = adjDr >= adjHw && adjDr >= adjAw && !newPredHome;
      if ((actualHome && newPredHome) || (actualDraw && newPredDraw) || (!actualHome && !actualDraw && !newPredHome && !newPredDraw)) newCorrect++;

      let oldDr = dr + (prevWeights.draw_calibration || 0);
      let oldHw = hw + (prevWeights.home_bias_adjustment || 0) - (prevWeights.draw_calibration || 0) / 2;
      let oldAw = aw - (prevWeights.home_bias_adjustment || 0) * 0.5 - (prevWeights.draw_calibration || 0) / 2;
      const t2 = oldHw + oldDr + oldAw;
      oldHw /= t2; oldDr /= t2; oldAw /= t2;
      const oldPredHome = oldHw > oldDr && oldHw > oldAw;
      const oldPredDraw = oldDr >= oldHw && oldDr >= oldAw && !oldPredHome;
      if ((actualHome && oldPredHome) || (actualDraw && oldPredDraw) || (!actualHome && !actualDraw && !oldPredHome && !oldPredDraw)) oldCorrect++;
    }

    let validationResult = "pending";
    let finalWeights = numericWeights;
    let finalErrorWeights = errorWeights;
    let finalCalibrationCorrections = calibrationCorrections;

    if (recentValid >= 10) {
      const newAcc = newCorrect / recentValid;
      const oldAcc = oldCorrect / recentValid;
      const improvement = newAcc - oldAcc;
      if (improvement >= 0.005) {
        validationResult = "passed";
      } else if (improvement >= -0.005) {
        validationResult = "marginal";
      } else {
        validationResult = "failed";
        finalWeights = prevWeights;
        finalErrorWeights = (latestPerf as any)?.error_weights || {};
        finalCalibrationCorrections = (latestPerf as any)?.calibration_corrections || {};
      }
    }

    const now2 = new Date();
    const periodEnd = now2.toISOString().slice(0, 10);
    const periodStart = new Date(now2.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const newVersion = prevVersion + 1;

    const { error: insertErr } = await supabase
      .from("model_performance")
      .insert({
        period_start: periodStart,
        period_end: periodEnd,
        total_matches: total,
        outcome_accuracy: outcomeAcc,
        ou_25_accuracy: ou25Acc,
        btts_accuracy: bttsAcc,
        exact_score_hits: exactScoreHits,
        avg_brier_1x2: avgBrier1x2,
        avg_brier_ou: avgBrierOu,
        avg_brier_btts: avgBrierBtts,
        mae_goals: mae,
        calibration_data: calibration,
        goal_line_accuracy: glAccuracy,
        feature_weights: featureWeights,
        weak_areas: weaknesses,
        numeric_weights: finalWeights,
        model_version: newVersion,
        validation_result: validationResult,
        last_learning_match_count: currentTotal,
        calibration_corrections: finalCalibrationCorrections,
        error_weights: finalErrorWeights,
      });

    if (insertErr) throw insertErr;

    const { data: oldVersions } = await supabase
      .from("model_performance")
      .select("id")
      .order("created_at", { ascending: false })
      .range(20, 1000);

    if (oldVersions && oldVersions.length > 0) {
      await supabase.from("model_performance").delete().in("id", oldVersions.map((v: any) => v.id));
    }

    return new Response(JSON.stringify({
      success: true,
      model_version: newVersion,
      validation_result: validationResult,
      total_matches: total,
      outcome_accuracy: outcomeAcc,
      ou_25_accuracy: ou25Acc,
      btts_accuracy: bttsAcc,
      exact_score_hits: exactScoreHits,
      mae_goals: mae,
      learning_cycle: { previous_count: prevMatchCount, current_count: currentTotal },
      error_weights: finalErrorWeights,
      calibration_corrections: finalCalibrationCorrections,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Compute model performance error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
