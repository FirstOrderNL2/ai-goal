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
    if (mode === "backfill_xg") {
      return await backfillXg(supabase, lovableApiKey, limit);
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

    // Build form lookup
    const formMap = new Map<string, string[]>();
    const homeFormMap = new Map<string, string[]>();
    const awayFormMap = new Map<string, string[]>();
    const statsMap = new Map<string, { avgScored: string; avgConceded: string; cleanSheets: number; played: number }>();

    for (const tid of teamIds) {
      const teamMatches = (recentMatches || [])
        .filter((m: any) => m.team_home_id === tid || m.team_away_id === tid)
        .slice(0, 10);

      // Overall form (last 5)
      const form = teamMatches.slice(0, 5).map((m: any) => {
        const isHome = m.team_home_id === tid;
        const gf = isHome ? m.goals_home : m.goals_away;
        const ga = isHome ? m.goals_away : m.goals_home;
        return (gf ?? 0) > (ga ?? 0) ? "W" : (gf ?? 0) === (ga ?? 0) ? "D" : "L";
      });
      formMap.set(tid, form);

      // Home-only form
      const homeMatches = teamMatches.filter((m: any) => m.team_home_id === tid).slice(0, 5);
      homeFormMap.set(tid, homeMatches.map((m: any) => {
        const r = (m.goals_home ?? 0) > (m.goals_away ?? 0) ? "W" : (m.goals_home ?? 0) === (m.goals_away ?? 0) ? "D" : "L";
        return `${r} (${m.goals_home}-${m.goals_away})`;
      }));

      // Away-only form
      const awayMatches = teamMatches.filter((m: any) => m.team_away_id === tid).slice(0, 5);
      awayFormMap.set(tid, awayMatches.map((m: any) => {
        const r = (m.goals_away ?? 0) > (m.goals_home ?? 0) ? "W" : (m.goals_away ?? 0) === (m.goals_home ?? 0) ? "D" : "L";
        return `${r} (${m.goals_away}-${m.goals_home})`;
      }));

      // Stats
      let scored = 0, conceded = 0, cleanSheets = 0;
      for (const m of teamMatches) {
        const isHome = m.team_home_id === tid;
        const gf = isHome ? (m.goals_home ?? 0) : (m.goals_away ?? 0);
        const ga = isHome ? (m.goals_away ?? 0) : (m.goals_home ?? 0);
        scored += gf;
        conceded += ga;
        if (ga === 0) cleanSheets++;
      }
      if (teamMatches.length > 0) {
        statsMap.set(tid, {
          played: teamMatches.length,
          avgScored: (scored / teamMatches.length).toFixed(1),
          avgConceded: (conceded / teamMatches.length).toFixed(1),
          cleanSheets,
        });
      }
    }

    // Build H2H lookup
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

      // Fetch live context (cached after first call)
      let liveContext = "";
      try {
        liveContext = await fetchMatchContextForBatch(
          homeName, awayName, match.league, match.match_date, match.id,
          supabaseUrl, serviceKey
        );
      } catch (_) {
        // Non-critical
      }

      const prompt = `Analyze this football match and provide a prediction.

Match: ${homeName} vs ${awayName}
League: ${match.league}
Date: ${match.match_date}
${homeName} overall form (last 5): ${homeForm.join(", ") || "Unknown"}
${awayName} overall form (last 5): ${awayForm.join(", ") || "Unknown"}
${homeHome.length ? `${homeName} HOME form: ${homeHome.join(", ")}` : ""}
${awayAway.length ? `${awayName} AWAY form: ${awayAway.join(", ")}` : ""}
${h2h ? `Head-to-head recent: ${h2h}` : "No H2H data"}
${homeStats ? `${homeName} stats (last ${homeStats.played}): avg scored ${homeStats.avgScored}, avg conceded ${homeStats.avgConceded}, clean sheets ${homeStats.cleanSheets}` : ""}
${awayStats ? `${awayName} stats (last ${awayStats.played}): avg scored ${awayStats.avgScored}, avg conceded ${awayStats.avgConceded}, clean sheets ${awayStats.cleanSheets}` : ""}
${liveContext ? `\nLIVE CONTEXT (injuries, lineups, news):\n${liveContext.slice(0, 3000)}` : ""}

Call the predict_match function with your analysis.`;

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
              { role: "system", content: "You are an expert football analyst. Use team form, home/away splits, head-to-head history, goal-scoring stats, injuries, lineups, and league context to make calibrated predictions. Be data-driven and precise." },
              { role: "user", content: prompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "predict_match",
                description: "Submit structured match prediction",
                parameters: {
                  type: "object",
                  properties: {
                    home_win: { type: "number", description: "Home win probability 0-1" },
                    draw: { type: "number", description: "Draw probability 0-1" },
                    away_win: { type: "number", description: "Away win probability 0-1" },
                    expected_goals_home: { type: "number", description: "Expected goals for home team (e.g. 1.4)" },
                    expected_goals_away: { type: "number", description: "Expected goals for away team (e.g. 1.1)" },
                    predicted_score_home: { type: "integer", description: "Predicted exact goals for home team" },
                    predicted_score_away: { type: "integer", description: "Predicted exact goals for away team" },
                    over_under_25: { type: "string", enum: ["over", "under"], description: "Over or under 2.5 total goals" },
                    btts: { type: "string", enum: ["yes", "no"], description: "Both teams to score" },
                    confidence: { type: "number", description: "Model confidence 0-1 based on data quality" },
                    reasoning: { type: "string", description: "Brief fact-based justification for the prediction citing specific stats" },
                  },
                  required: ["home_win", "draw", "away_win", "expected_goals_home", "expected_goals_away", "predicted_score_home", "predicted_score_away", "over_under_25", "btts", "confidence", "reasoning"],
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

        // Normalize probabilities
        const total = (pred.home_win || 0) + (pred.draw || 0) + (pred.away_win || 0);
        const hw = total > 0 ? pred.home_win / total : 0.4;
        const dr = total > 0 ? pred.draw / total : 0.3;
        const aw = total > 0 ? pred.away_win / total : 0.3;

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
          ai_reasoning: pred.reasoning || null,
        }, { onConflict: "match_id" });

        if (upsertErr) {
          errors.push(`DB error for ${homeName} vs ${awayName}: ${upsertErr.message}`);
        } else {
          generated++;
        }

        // Rate limit: longer delay because we're calling fetch-match-context + AI
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

async function backfillXg(supabase: any, lovableApiKey: string, limit: number) {
  const { data: preds } = await supabase
    .from("predictions")
    .select("id, match_id, home_win, draw, away_win")
    .eq("expected_goals_home", 0)
    .eq("expected_goals_away", 0)
    .limit(limit);

  if (!preds || preds.length === 0) {
    return new Response(JSON.stringify({ success: true, message: "No predictions need xG backfill", backfilled: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const matchIds = preds.map((p: any) => p.match_id);
  const { data: matches } = await supabase
    .from("matches")
    .select("id, league, team_home_id, team_away_id, home_team:teams!matches_team_home_id_fkey(name), away_team:teams!matches_team_away_id_fkey(name)")
    .in("id", matchIds);

  const matchMap = new Map((matches || []).map((m: any) => [m.id, m]));

  let backfilled = 0;
  const errors: string[] = [];

  for (const pred of preds) {
    const match = matchMap.get(pred.match_id);
    if (!match) continue;

    const homeName = match.home_team?.name ?? "Home";
    const awayName = match.away_team?.name ?? "Away";

    try {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableApiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a football analyst. Estimate expected goals (xG) for a match based on the teams and probabilities provided." },
            { role: "user", content: `Match: ${homeName} vs ${awayName}, League: ${match.league}. Win probabilities: Home ${(pred.home_win * 100).toFixed(0)}%, Draw ${(pred.draw * 100).toFixed(0)}%, Away ${(pred.away_win * 100).toFixed(0)}%. Estimate realistic xG for each team. Use the set_xg tool.` },
          ],
          tools: [{
            type: "function",
            function: {
              name: "set_xg",
              description: "Set expected goals",
              parameters: {
                type: "object",
                properties: {
                  expected_goals_home: { type: "number", description: "Home team xG (e.g. 1.4)" },
                  expected_goals_away: { type: "number", description: "Away team xG (e.g. 1.1)" },
                  over_under_25: { type: "string", enum: ["over", "under"] },
                },
                required: ["expected_goals_home", "expected_goals_away", "over_under_25"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "set_xg" } },
        }),
      });

      if (!aiRes.ok) {
        if (aiRes.status === 429) { errors.push("Rate limited, stopping"); break; }
        await aiRes.text();
        continue;
      }

      const aiData = await aiRes.json();
      const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!tc?.function?.arguments) continue;

      const xg = JSON.parse(tc.function.arguments);
      const { error: upErr } = await supabase.from("predictions").update({
        expected_goals_home: Math.round((xg.expected_goals_home || 1.2) * 10) / 10,
        expected_goals_away: Math.round((xg.expected_goals_away || 1.0) * 10) / 10,
        over_under_25: xg.over_under_25 || "under",
      }).eq("id", pred.id);

      if (!upErr) backfilled++;
      else errors.push(`Update error: ${upErr.message}`);

      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      errors.push(`xG error for ${homeName} vs ${awayName}: ${e.message}`);
    }
  }

  return new Response(JSON.stringify({ success: true, backfilled, total: preds.length, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
