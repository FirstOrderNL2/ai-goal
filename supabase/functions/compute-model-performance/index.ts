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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: matches, error: mErr } = await supabase
      .from("matches")
      .select("id, goals_home, goals_away, match_date, league")
      .eq("status", "completed")
      .order("match_date", { ascending: false })
      .limit(1000);

    console.log("Matches query result:", mErr ? JSON.stringify(mErr) : `${matches?.length} matches`);
    if (mErr) {
      throw new Error(`Match query failed: ${JSON.stringify(mErr)}`);
    }
    if (!matches || matches.length === 0) {
      return new Response(JSON.stringify({ message: "No completed matches" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const matchIds = matches.map((m: any) => m.id);
    
    // Chunk matchIds to avoid URL-too-long errors
    const chunkSize = 200;
    const allPredictions: any[] = [];
    for (let i = 0; i < matchIds.length; i += chunkSize) {
      const chunk = matchIds.slice(i, i + chunkSize);
      const { data: preds, error: pErr } = await supabase
        .from("predictions")
        .select("*")
        .in("match_id", chunk);
      if (pErr) {
        console.error("Prediction chunk error:", JSON.stringify(pErr));
        throw pErr;
      }
      if (preds) allPredictions.push(...preds);
    }
    
    const predictions = allPredictions;
    if (predictions.length === 0) {
      return new Response(JSON.stringify({ message: "No predictions found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const predMap = new Map(predictions.map((p: any) => [p.match_id, p]));

    let total = 0, outcomeCorrect = 0, ou25Correct = 0, bttsCorrect = 0, exactScoreHits = 0;
    let totalBrier1x2 = 0, totalBrierOu = 0, totalBrierBtts = 0;
    let totalMaeGoals = 0;
    const calibrationBuckets: Record<string, { predicted: number; actual: number; count: number }> = {};
    const goalLineHits: Record<string, { correct: number; total: number }> = {};
    const weaknesses: string[] = [];

    // Init calibration buckets (0-10%, 10-20%, ... 90-100%)
    for (let i = 0; i < 10; i++) {
      calibrationBuckets[`${i * 10}-${(i + 1) * 10}`] = { predicted: 0, actual: 0, count: 0 };
    }

    // Init goal line trackers
    for (const line of ["0_5", "1_5", "2_5", "3_5", "4_5"]) {
      goalLineHits[`over_${line}`] = { correct: 0, total: 0 };
      goalLineHits[`under_${line}`] = { correct: 0, total: 0 };
    }

    for (const match of matches) {
      const pred = predMap.get(match.id);
      if (!pred) continue;

      total++;
      const gh = match.goals_home!;
      const ga = match.goals_away!;
      const totalGoals = gh + ga;

      // 1X2 accuracy
      const actualHome = gh > ga;
      const actualDraw = gh === ga;
      const actualAway = ga > gh;
      const hw = Number(pred.home_win) || 0;
      const dr = Number(pred.draw) || 0;
      const aw = Number(pred.away_win) || 0;
      const predHome = hw > dr && hw > aw;
      const predDraw = dr >= hw && dr >= aw && !predHome;
      const predAway = !predHome && !predDraw;

      if ((actualHome && predHome) || (actualDraw && predDraw) || (actualAway && predAway)) {
        outcomeCorrect++;
      }

      // O/U 2.5
      const predOver = pred.over_under_25 === "over";
      if ((totalGoals > 2.5 && predOver) || (totalGoals <= 2.5 && !predOver)) {
        ou25Correct++;
      }

      // BTTS
      const actualBtts = gh > 0 && ga > 0;
      const predBtts = pred.btts === "yes";
      if (actualBtts === predBtts) bttsCorrect++;

      // Exact score
      if (pred.predicted_score_home === gh && pred.predicted_score_away === ga) exactScoreHits++;

      // Brier scores
      totalBrier1x2 += Math.pow(hw - (actualHome ? 1 : 0), 2) + Math.pow(dr - (actualDraw ? 1 : 0), 2) + Math.pow(aw - (actualAway ? 1 : 0), 2);
      totalBrierOu += Math.pow((predOver ? 1 : 0) - (totalGoals > 2.5 ? 1 : 0), 2);
      totalBrierBtts += Math.pow((predBtts ? 1 : 0) - (actualBtts ? 1 : 0), 2);

      // MAE goals
      totalMaeGoals += Math.abs((Number(pred.expected_goals_home) || 0) - gh) + Math.abs((Number(pred.expected_goals_away) || 0) - ga);

      // Calibration — use max probability as the "confidence"
      const maxProb = Math.max(hw, dr, aw);
      const bucket = Math.min(Math.floor(maxProb * 10), 9);
      const bucketKey = `${bucket * 10}-${(bucket + 1) * 10}`;
      calibrationBuckets[bucketKey].predicted += maxProb;
      calibrationBuckets[bucketKey].actual += ((actualHome && predHome) || (actualDraw && predDraw) || (actualAway && predAway)) ? 1 : 0;
      calibrationBuckets[bucketKey].count++;

      // Goal line accuracy
      if (pred.goal_lines) {
        const gl = pred.goal_lines as Record<string, number>;
        const thresholds = [0.5, 1.5, 2.5, 3.5, 4.5];
        for (const t of thresholds) {
          const key = t.toString().replace(".", "_");
          const overKey = `over_${key}`;
          const underKey = `under_${key}`;
          if (gl[overKey] != null) {
            goalLineHits[overKey].total++;
            const predictedOver = gl[overKey] > 0.5;
            if ((totalGoals > t && predictedOver) || (totalGoals <= t && !predictedOver)) {
              goalLineHits[overKey].correct++;
            }
          }
          if (gl[underKey] != null) {
            goalLineHits[underKey].total++;
            const predictedUnder = gl[underKey] > 0.5;
            if ((totalGoals <= t && predictedUnder) || (totalGoals > t && !predictedUnder)) {
              goalLineHits[underKey].correct++;
            }
          }
        }
      }
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

    // Process calibration
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

    // Process goal line accuracy
    const glAccuracy: Record<string, number> = {};
    for (const [key, val] of Object.entries(goalLineHits)) {
      if (val.total > 0) {
        glAccuracy[key] = Math.round((val.correct / val.total) * 1000) / 10;
      }
    }

    // Identify weak areas
    if (outcomeAcc < 45) weaknesses.push(`1X2 accuracy is low at ${outcomeAcc}% — consider adjusting outcome probability calibration`);
    if (ou25Acc < 50) weaknesses.push(`Over/Under 2.5 accuracy is ${ou25Acc}% — review Poisson lambda inputs`);
    if (bttsAcc < 50) weaknesses.push(`BTTS accuracy is ${bttsAcc}% — review team scoring rate calculations`);
    if (mae > 2.0) weaknesses.push(`MAE for goals is ${mae} — expected goals estimates are too far from reality`);

    // Check calibration gaps
    for (const [key, val] of Object.entries(calibration)) {
      const gap = Math.abs(val.avg_predicted - val.actual_rate);
      if (gap > 0.15 && val.count >= 10) {
        if (val.avg_predicted > val.actual_rate) {
          weaknesses.push(`Overconfident in ${key}% range: predicted ${Math.round(val.avg_predicted * 100)}% but actual ${Math.round(val.actual_rate * 100)}%`);
        } else {
          weaknesses.push(`Underconfident in ${key}% range: predicted ${Math.round(val.avg_predicted * 100)}% but actual ${Math.round(val.actual_rate * 100)}%`);
        }
      }
    }

    // Check goal line weaknesses
    for (const [key, acc] of Object.entries(glAccuracy)) {
      if (acc < 45) {
        weaknesses.push(`${key.replace("_", " ").replace("_", ".")} predictions are weak at ${acc}%`);
      }
    }

    const now = new Date();
    const periodEnd = now.toISOString().slice(0, 10);
    const periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { error: upsertErr } = await supabase
      .from("model_performance")
      .upsert({
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
        feature_weights: {},
        weak_areas: weaknesses,
      });

    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({
      success: true,
      total_matches: total,
      outcome_accuracy: outcomeAcc,
      ou_25_accuracy: ou25Acc,
      btts_accuracy: bttsAcc,
      exact_score_hits: exactScoreHits,
      brier_scores: { "1x2": avgBrier1x2, ou: avgBrierOu, btts: avgBrierBtts },
      mae_goals: mae,
      weak_areas: weaknesses,
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
