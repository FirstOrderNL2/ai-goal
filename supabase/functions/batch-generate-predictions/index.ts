import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchMatchContextForBatch(
  homeName: string, awayName: string, league: string, matchDate: string,
  matchId: string, supabaseUrl: string, serviceKey: string
): Promise<string> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/fetch-match-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        home_team: homeName,
        away_team: awayName,
        league,
        match_date: matchDate,
        match_id: matchId,
      }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data.context || "";
  } catch (e) {
    console.error(`Context fetch failed for ${homeName} vs ${awayName}:`, e);
    return "";
  }
}

// ── Poisson helpers (same as main engine) ──
function poissonPMF(lambda: number, k: number): number {
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) {
    result *= lambda / i;
  }
  return result;
}

function computeStatisticalAnchors(
  homeStats: { avgScored: string; avgConceded: string } | null,
  awayStats: { avgScored: string; avgConceded: string } | null,
  odds: any | null
) {
  const result: any = {};
  if (homeStats && awayStats) {
    const leagueAvg = 1.35;
    const hAtk = parseFloat(homeStats.avgScored) / leagueAvg;
    const aDefW = parseFloat(awayStats.avgConceded) / leagueAvg;
    const aAtk = parseFloat(awayStats.avgScored) / leagueAvg;
    const hDefW = parseFloat(homeStats.avgConceded) / leagueAvg;

    result.poisson_xg_home = Math.round(hAtk * aDefW * leagueAvg * 100) / 100;
    result.poisson_xg_away = Math.round(aAtk * hDefW * leagueAvg * 100) / 100;

    let hw = 0, dr = 0, aw = 0, o25 = 0;
    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        const p = poissonPMF(result.poisson_xg_home, h) * poissonPMF(result.poisson_xg_away, a);
        if (h > a) hw += p; else if (h === a) dr += p; else aw += p;
        if (h + a > 2) o25 += p;
      }
    }
    result.poisson_home_win = Math.round(hw * 1000) / 1000;
    result.poisson_draw = Math.round(dr * 1000) / 1000;
    result.poisson_away_win = Math.round(aw * 1000) / 1000;
    result.poisson_over_25 = Math.round(o25 * 1000) / 1000;

    const hScore = parseFloat(homeStats.avgScored);
    const aScore = parseFloat(awayStats.avgScored);
    result.poisson_btts = Math.round((1 - poissonPMF(hScore, 0)) * (1 - poissonPMF(aScore, 0)) * 1000) / 1000;
  }
  if (odds) {
    const h = 1 / odds.home_win_odds, d = 1 / odds.draw_odds, a = 1 / odds.away_win_odds;
    const t = h + d + a;
    result.implied_home_win = Math.round((h / t) * 1000) / 1000;
    result.implied_draw = Math.round((d / t) * 1000) / 1000;
    result.implied_away_win = Math.round((a / t) * 1000) / 1000;
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not set");

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const limit = body.limit ?? 10;
    const mode = body.mode ?? "upcoming";

    if (mode === "review") {
      return await generateReviews(supabase, supabaseUrl, serviceKey, lovableApiKey, limit);
    }

    // Get upcoming matches without predictions
    const { data: matches, error: matchErr } = await supabase
      .from("matches")
      .select("id, league, match_date, team_home_id, team_away_id, home_team:teams!matches_team_home_id_fkey(name), away_team:teams!matches_team_away_id_fkey(name)")
      .eq("status", "upcoming")
      .order("match_date", { ascending: true })
      .limit(50);

    if (matchErr) throw matchErr;
    if (!matches || matches.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No upcoming matches", generated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing predictions
    const matchIds = matches.map((m: any) => m.id);
    const { data: existingPreds } = await supabase
      .from("predictions")
      .select("match_id")
      .in("match_id", matchIds);

    const existingSet = new Set((existingPreds || []).map((p: any) => p.match_id));
    const needsPrediction = matches.filter((m: any) => !existingSet.has(m.id)).slice(0, limit);

    if (needsPrediction.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "All upcoming matches have predictions", generated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get form + H2H data for all teams involved
    const teamIds = [...new Set(needsPrediction.flatMap((m: any) => [m.team_home_id, m.team_away_id]))];
    const { data: recentMatches } = await supabase
      .from("matches")
      .select("team_home_id, team_away_id, goals_home, goals_away, status, match_date")
      .eq("status", "completed")
      .or(teamIds.map(id => `team_home_id.eq.${id},team_away_id.eq.${id}`).join(","))
      .order("match_date", { ascending: false })
      .limit(500);

    // Get odds for all matches
    const { data: allOdds } = await supabase
      .from("odds")
      .select("match_id, home_win_odds, draw_odds, away_win_odds")
      .in("match_id", needsPrediction.map((m: any) => m.id));
    const oddsMap = new Map((allOdds || []).map((o: any) => [o.match_id, o]));

    // Get past reviews for learning
    const { data: pastReviews } = await supabase
      .from("matches")
      .select("ai_post_match_review, ai_accuracy_score, home_team:teams!matches_team_home_id_fkey(name), away_team:teams!matches_team_away_id_fkey(name)")
      .not("ai_post_match_review", "is", null)
      .eq("status", "completed")
      .order("match_date", { ascending: false })
      .limit(5);

    let learningBlock = "";
    if (pastReviews && pastReviews.length > 0) {
      const avgScore = pastReviews.reduce((s: number, r: any) => s + (Number(r.ai_accuracy_score) || 0), 0) / pastReviews.length;
      learningBlock = `\nLEARNING FROM PAST PREDICTIONS (avg accuracy: ${Math.round(avgScore)}/100):
${pastReviews.slice(0, 3).map((r: any) => `- ${(r as any).home_team?.name} vs ${(r as any).away_team?.name} (${r.ai_accuracy_score}/100): ${r.ai_post_match_review?.slice(0, 200)}...`).join("\n")}
Apply the lessons above.`;
    }

    // Build form + stats lookup
    const formMap = new Map<string, string[]>();
    const homeFormMap = new Map<string, string[]>();
    const awayFormMap = new Map<string, string[]>();
    const statsMap = new Map<string, { avgScored: string; avgConceded: string; cleanSheets: number; played: number; bttsRate: number }>();

    for (const tid of teamIds) {
      const teamMatches = (recentMatches || [])
        .filter((m: any) => m.team_home_id === tid || m.team_away_id === tid)
        .slice(0, 10);

      const form = teamMatches.slice(0, 5).map((m: any) => {
        const isHome = m.team_home_id === tid;
        const gf = isHome ? m.goals_home : m.goals_away;
        const ga = isHome ? m.goals_away : m.goals_home;
        return (gf ?? 0) > (ga ?? 0) ? "W" : (gf ?? 0) === (ga ?? 0) ? "D" : "L";
      });
      formMap.set(tid, form);

      const homeMatches = teamMatches.filter((m: any) => m.team_home_id === tid).slice(0, 5);
      homeFormMap.set(tid, homeMatches.map((m: any) => {
        const r = (m.goals_home ?? 0) > (m.goals_away ?? 0) ? "W" : (m.goals_home ?? 0) === (m.goals_away ?? 0) ? "D" : "L";
        return `${r} (${m.goals_home}-${m.goals_away})`;
      }));

      const awayMatches = teamMatches.filter((m: any) => m.team_away_id === tid).slice(0, 5);
      awayFormMap.set(tid, awayMatches.map((m: any) => {
        const r = (m.goals_away ?? 0) > (m.goals_home ?? 0) ? "W" : (m.goals_away ?? 0) === (m.goals_home ?? 0) ? "D" : "L";
        return `${r} (${m.goals_away}-${m.goals_home})`;
      }));

      let scored = 0, conceded = 0, cleanSheets = 0, bttsCount = 0;
      for (const m of teamMatches) {
        const isHome = m.team_home_id === tid;
        const gf = isHome ? (m.goals_home ?? 0) : (m.goals_away ?? 0);
        const ga = isHome ? (m.goals_away ?? 0) : (m.goals_home ?? 0);
        scored += gf;
        conceded += ga;
        if (ga === 0) cleanSheets++;
        if (gf > 0 && ga > 0) bttsCount++;
      }
      if (teamMatches.length > 0) {
        statsMap.set(tid, {
          played: teamMatches.length,
          avgScored: (scored / teamMatches.length).toFixed(1),
          avgConceded: (conceded / teamMatches.length).toFixed(1),
          cleanSheets,
          bttsRate: Math.round((bttsCount / teamMatches.length) * 100),
        });
      }
    }

    function getH2H(homeId: string, awayId: string): string {
      const h2h = (recentMatches || []).filter(
        (m: any) =>
          (m.team_home_id === homeId && m.team_away_id === awayId) ||
          (m.team_home_id === awayId && m.team_away_id === homeId)
      ).slice(0, 5);
      if (h2h.length === 0) return "";
      return h2h.map((m: any) => `${m.match_date?.slice(0, 10)}: ${m.goals_home}-${m.goals_away}`).join(", ");
    }

    let generated = 0;
    const errors: string[] = [];

    for (const match of needsPrediction) {
      const homeName = (match as any).home_team?.name ?? "Home";
      const awayName = (match as any).away_team?.name ?? "Away";
      const homeForm = formMap.get(match.team_home_id) || [];
      const awayForm = formMap.get(match.team_away_id) || [];
      const homeHome = homeFormMap.get(match.team_home_id) || [];
      const awayAway = awayFormMap.get(match.team_away_id) || [];
      const homeStats = statsMap.get(match.team_home_id);
      const awayStats = statsMap.get(match.team_away_id);
      const h2h = getH2H(match.team_home_id, match.team_away_id);
      const matchOdds = oddsMap.get(match.id);

      // Compute statistical anchors
      const anchors = computeStatisticalAnchors(homeStats || null, awayStats || null, matchOdds || null);

      // Fetch live context (cached after first call)
      let liveContext = "";
      try {
        liveContext = await fetchMatchContextForBatch(
          homeName, awayName, match.league, match.match_date, match.id,
          supabaseUrl, serviceKey
        );
      } catch (_) {}

      let anchorsBlock = "";
      if (anchors.poisson_xg_home != null) {
        anchorsBlock += `\nSTATISTICAL MODEL (Poisson):
Poisson xG: ${homeName} ${anchors.poisson_xg_home} - ${anchors.poisson_xg_away} ${awayName}
Poisson probabilities: Home ${Math.round(anchors.poisson_home_win * 100)}%, Draw ${Math.round(anchors.poisson_draw * 100)}%, Away ${Math.round(anchors.poisson_away_win * 100)}%
Poisson Over 2.5: ${Math.round(anchors.poisson_over_25 * 100)}%, Poisson BTTS: ${Math.round(anchors.poisson_btts * 100)}%`;
      }
      if (anchors.implied_home_win != null) {
        anchorsBlock += `\nMARKET IMPLIED: Home ${Math.round(anchors.implied_home_win * 100)}%, Draw ${Math.round(anchors.implied_draw * 100)}%, Away ${Math.round(anchors.implied_away_win * 100)}%`;
      }

      const systemPrompt = `You are a world-class football analyst. Make ACCURATE, FACT-BASED predictions.

RULES:
1. Use the STATISTICAL MODEL (Poisson) as your mathematical anchor — deviate only with clear justification
2. Compare against MARKET IMPLIED PROBABILITIES — note disagreements
3. Every claim must reference a specific stat from the data
4. Predicted score must be consistent with BTTS and Over/Under verdicts
5. Be honest about uncertainty when data is sparse
${learningBlock}

Call predict_match with your structured analysis.`;

      const prompt = `Analyze and predict:

Match: ${homeName} vs ${awayName}
League: ${match.league}
Date: ${match.match_date}
${matchOdds ? `Odds: Home ${matchOdds.home_win_odds}, Draw ${matchOdds.draw_odds}, Away ${matchOdds.away_win_odds}` : ""}
${anchorsBlock}
${homeName} overall form (last 5): ${homeForm.join(", ") || "Unknown"}
${awayName} overall form (last 5): ${awayForm.join(", ") || "Unknown"}
${homeHome.length ? `${homeName} HOME form: ${homeHome.join(", ")}` : ""}
${awayAway.length ? `${awayName} AWAY form: ${awayAway.join(", ")}` : ""}
${h2h ? `Head-to-head recent: ${h2h}` : "No H2H data"}
${homeStats ? `${homeName} stats (last ${homeStats.played}): avg scored ${homeStats.avgScored}, avg conceded ${homeStats.avgConceded}, clean sheets ${homeStats.cleanSheets}, BTTS rate ${homeStats.bttsRate}%` : ""}
${awayStats ? `${awayName} stats (last ${awayStats.played}): avg scored ${awayStats.avgScored}, avg conceded ${awayStats.avgConceded}, clean sheets ${awayStats.cleanSheets}, BTTS rate ${awayStats.bttsRate}%` : ""}
${liveContext ? `\nLIVE CONTEXT:\n${liveContext.slice(0, 3000)}` : ""}`;

      try {
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
              { role: "user", content: prompt },
            ],
            reasoning: { effort: "high" },
            max_tokens: 3000,
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
                    winner_reasoning: { type: "string", description: "2-3 bullet points with specific stats for winner prediction. Reference Poisson vs market." },
                    btts_reasoning: { type: "string", description: "1-2 bullet points with scoring/conceding rates for BTTS verdict." },
                    over_under_reasoning: { type: "string", description: "1-2 bullet points with goal averages and Poisson probability." },
                    key_factors: { type: "string", description: "2-3 bullet points on injuries, context, market disagreements." },
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
          await aiResponse.text();
          if (status === 429) {
            errors.push(`Rate limited at match ${generated + 1}, stopping`);
            break;
          }
          errors.push(`AI error ${status} for ${homeName} vs ${awayName}`);
          continue;
        }

        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall?.function?.arguments) {
          errors.push(`No tool call for ${homeName} vs ${awayName}`);
          continue;
        }

        const pred = JSON.parse(toolCall.function.arguments);

        // Auto-fix consistency
        const totalScore = (pred.predicted_score_home ?? 0) + (pred.predicted_score_away ?? 0);
        pred.over_under_25 = totalScore > 2 ? "over" : "under";
        pred.btts = (pred.predicted_score_home > 0 && pred.predicted_score_away > 0) ? "yes" : "no";

        // Normalize probabilities
        const total = (pred.home_win || 0) + (pred.draw || 0) + (pred.away_win || 0);
        const hw = total > 0 ? pred.home_win / total : 0.4;
        const dr = total > 0 ? pred.draw / total : 0.3;
        const aw = total > 0 ? pred.away_win / total : 0.3;

        // Build structured reasoning
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

        const { error: upsertErr } = await supabase.from("predictions").upsert({
          match_id: match.id,
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

        if (upsertErr) {
          errors.push(`DB error for ${homeName} vs ${awayName}: ${upsertErr.message}`);
        } else {
          generated++;
        }

        // Rate limit delay
        await new Promise(r => setTimeout(r, 3000));
      } catch (e) {
        errors.push(`Error for ${homeName} vs ${awayName}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, generated, total: needsPrediction.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("batch-generate-predictions error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function generateReviews(supabase: any, supabaseUrl: string, serviceKey: string, lovableApiKey: string, limit: number) {
  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "completed")
    .is("ai_post_match_review", null)
    .not("goals_home", "is", null)
    .order("match_date", { ascending: false })
    .limit(limit);

  if (!matches || matches.length === 0) {
    return new Response(JSON.stringify({ success: true, message: "No matches need reviews", reviewed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let reviewed = 0;
  const errors: string[] = [];

  for (const match of matches) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-post-match-review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ match_id: match.id }),
      });
      if (res.ok) reviewed++;
      else errors.push(`Review failed for ${match.id}: ${res.status}`);
      await res.text();
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      errors.push(`Review error: ${e.message}`);
    }
  }

  return new Response(JSON.stringify({ success: true, reviewed, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
