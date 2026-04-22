import { createClient } from "npm:@supabase/supabase-js@2";
import { checkAccess } from "../_shared/access-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://v3.football.api-sports.io";

async function apiFootballFetch(path: string, apiKey: string): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "x-apisports-key": apiKey },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.response ?? [];
  } catch (e) {
    console.error(`API-Football fetch failed for ${path}:`, e);
    return [];
  }
}

function formatStatistics(stats: any[]): string {
  if (!stats.length) return "";
  return stats.map((s: any) => {
    const team = s.team?.name ?? "?";
    const items = (s.statistics ?? []).map((st: any) => `${st.type}: ${st.value ?? "N/A"}`).join(", ");
    return `${team}: ${items}`;
  }).join("\n");
}

function formatEvents(events: any[]): string {
  if (!events.length) return "";
  return events.map((e: any) => {
    const min = e.time?.elapsed ?? "?";
    const team = e.team?.name ?? "?";
    const player = e.player?.name ?? "?";
    const type = e.type ?? "";
    const detail = e.detail ?? "";
    return `${min}' ${team} — ${type} (${detail}): ${player}`;
  }).join("\n");
}

async function fetchPostMatchContext(homeName: string, awayName: string, league: string, matchDate: string): Promise<string> {
  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) return "";

    const prompt = `Search for post-match reports and analysis of this football match:

${homeName} vs ${awayName}
League: ${league}
Date: ${matchDate}

Find:
1. Match report summary (key events, goals, red cards, substitutions)
2. Manager post-match quotes
3. Standout player performances
4. Any controversial decisions or VAR incidents
5. Key statistics from the match

Be specific and factual. Format as plain text paragraphs.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });

    if (!res.ok) return "";
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (e) {
    console.error("Failed to fetch post-match context:", e);
    return "";
  }
}

// ── Brier score calculation ──
function computeBrierScore(
  prediction: any,
  actualGoalsHome: number,
  actualGoalsAway: number
): { brier_1x2: number; brier_ou: number; brier_btts: number; exact_score_hit: boolean; outcome_hit: boolean } {
  // Determine actual outcomes
  const homeWon = actualGoalsHome > actualGoalsAway;
  const drawn = actualGoalsHome === actualGoalsAway;
  const awayWon = actualGoalsHome < actualGoalsAway;
  const totalGoals = actualGoalsHome + actualGoalsAway;
  const actualOver = totalGoals > 2.5;
  const actualBtts = actualGoalsHome > 0 && actualGoalsAway > 0;

  // 1X2 Brier score (lower is better, 0 = perfect, 2 = worst)
  const hw = Number(prediction.home_win) || 0;
  const dr = Number(prediction.draw) || 0;
  const aw = Number(prediction.away_win) || 0;
  const brier_1x2 = Math.round((
    Math.pow(hw - (homeWon ? 1 : 0), 2) +
    Math.pow(dr - (drawn ? 1 : 0), 2) +
    Math.pow(aw - (awayWon ? 1 : 0), 2)
  ) * 1000) / 1000;

  // Over/Under Brier score
  const predOver = prediction.over_under_25 === "over" ? 1 : 0;
  const brier_ou = Math.round(Math.pow(predOver - (actualOver ? 1 : 0), 2) * 1000) / 1000;

  // BTTS Brier score
  const predBtts = prediction.btts === "yes" ? 1 : 0;
  const brier_btts = Math.round(Math.pow(predBtts - (actualBtts ? 1 : 0), 2) * 1000) / 1000;

  // Exact score hit
  const exact_score_hit = (
    prediction.predicted_score_home === actualGoalsHome &&
    prediction.predicted_score_away === actualGoalsAway
  );

  // Outcome hit (correct 1X2)
  const predictedHomeWin = hw > dr && hw > aw;
  const predictedDraw = dr >= hw && dr >= aw;
  const predictedAwayWin = aw > hw && aw > dr;
  const outcome_hit = (
    (predictedHomeWin && homeWon) ||
    (predictedDraw && drawn) ||
    (predictedAwayWin && awayWon)
  );

  return { brier_1x2, brier_ou, brier_btts, exact_score_hit, outcome_hit };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { match_id, system: systemCall } = await req.json();
    if (!systemCall) {
      const access = await checkAccess(req);
      if (!access.ok) {
        return new Response(JSON.stringify({ error: access.message }), {
          status: access.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    if (!match_id) {
      return new Response(JSON.stringify({ error: "match_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

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

    if (match.status !== "completed") {
      return new Response(JSON.stringify({ error: "Match not completed yet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: prediction }, { data: odds }] = await Promise.all([
      supabase.from("predictions").select("*").eq("match_id", match_id).single(),
      supabase.from("odds").select("*").eq("match_id", match_id).single(),
    ]);

    const homeName = match.home_team?.name ?? "Home";
    const awayName = match.away_team?.name ?? "Away";

    // ── Compute mathematical accuracy (Brier scores) ──
    let brierScores: any = null;
    if (prediction && match.goals_home != null && match.goals_away != null) {
      brierScores = computeBrierScore(prediction, match.goals_home, match.goals_away);
    }

    // ── Fetch structured match stats from API-Football ──
    let matchStatsBlock = "";
    const apiKey = Deno.env.get("API_FOOTBALL_KEY");
    if (apiKey && match.api_football_id) {
      const [stats, events] = await Promise.all([
        apiFootballFetch(`/fixtures/statistics?fixture=${match.api_football_id}`, apiKey),
        apiFootballFetch(`/fixtures/events?fixture=${match.api_football_id}`, apiKey),
      ]);
      const statsStr = formatStatistics(stats);
      const eventsStr = formatEvents(events);
      if (statsStr || eventsStr) {
        matchStatsBlock = `\nMATCH STATISTICS (API-Football):
${statsStr ? statsStr : ""}
${eventsStr ? `\nMATCH EVENTS:\n${eventsStr}` : ""}`;
      }
    }

    // Fetch post-match web context
    const postMatchContext = await fetchPostMatchContext(homeName, awayName, match.league, match.match_date);

    // Build mathematical accuracy section
    let brierBlock = "";
    if (brierScores) {
      brierBlock = `\nMATHEMATICAL ACCURACY (Brier scores — lower is better, 0 = perfect):
1X2 Brier: ${brierScores.brier_1x2} (${brierScores.outcome_hit ? "✓ Correct outcome" : "✗ Wrong outcome"})
Over/Under Brier: ${brierScores.brier_ou} (${prediction.over_under_25 === "over" ? "Over" : "Under"} 2.5 → actual: ${(match.goals_home + match.goals_away)} goals)
BTTS Brier: ${brierScores.brier_btts} (${prediction.btts === "yes" ? "Yes" : "No"} → actual: ${match.goals_home > 0 && match.goals_away > 0 ? "Yes" : "No"})
Exact Score: ${brierScores.exact_score_hit ? "✓ HIT!" : `✗ Predicted ${prediction.predicted_score_home ?? "?"}-${prediction.predicted_score_away ?? "?"}, actual ${match.goals_home}-${match.goals_away}`}
Combined Brier: ${Math.round((brierScores.brier_1x2 + brierScores.brier_ou + brierScores.brier_btts) * 1000 / 3) / 1000}`;
    }

    const prompt = `You are an expert football analyst performing a post-match review of your own prediction. Be brutally honest about what you got right and wrong.

MATCH RESULT:
${homeName} ${match.goals_home} - ${match.goals_away} ${awayName}
League: ${match.league}
Date: ${match.match_date}
${match.xg_home != null ? `Actual xG: ${homeName} ${match.xg_home} - ${match.xg_away} ${awayName}` : ""}

YOUR PRE-MATCH PREDICTION:
${match.ai_insights || "No pre-match prediction was generated."}

${prediction ? `MODEL PROBABILITIES:
Home win: ${Math.round(prediction.home_win * 100)}%
Draw: ${Math.round(prediction.draw * 100)}%
Away win: ${Math.round(prediction.away_win * 100)}%
Expected goals: ${prediction.expected_goals_home} - ${prediction.expected_goals_away}
Predicted score: ${prediction.predicted_score_home ?? "?"}-${prediction.predicted_score_away ?? "?"}
Over/Under 2.5: ${prediction.over_under_25}
BTTS: ${prediction.btts}
Model confidence: ${Math.round(prediction.model_confidence * 100)}%` : ""}
${brierBlock}

${odds ? `ODDS: Home ${odds.home_win_odds}, Draw ${odds.draw_odds}, Away ${odds.away_win_odds}` : ""}
${matchStatsBlock}
${postMatchContext ? `\nPOST-MATCH REPORTS FROM THE WEB:\n${postMatchContext}` : ""}

INSTRUCTIONS:
1. Compare your prediction against the actual result
2. Give yourself an accuracy score from 0-100 based on BOTH the mathematical Brier scores AND qualitative analysis
   - Use the Brier scores as your starting point (lower Brier = higher accuracy)
   - A combined Brier of 0.0-0.3 = excellent (80-100), 0.3-0.6 = good (60-80), 0.6-1.0 = poor (30-60), >1.0 = very poor (0-30)
3. Explain what you got right
4. Explain what you got wrong and why
5. Identify factors you underestimated or missed
6. Write specific lessons for future predictions involving these teams or similar matchups

FORMAT YOUR RESPONSE AS:
First line must be ONLY the numeric score (0-100), nothing else.
Then a blank line.
Then your detailed review in flowing paragraphs (3-4 paragraphs). No markdown headers or bullet points.`;

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not set");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1200,
        temperature: 0.5,
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
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    const lines = rawContent.trim().split("\n");
    let accuracyScore = 50;
    let review = rawContent;

    const firstLine = lines[0]?.trim();
    const parsed = parseInt(firstLine, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      accuracyScore = parsed;
      review = lines.slice(1).join("\n").trim();
    }

    // If we have Brier scores, constrain the AI score to be within range of mathematical reality
    if (brierScores) {
      const combinedBrier = (brierScores.brier_1x2 + brierScores.brier_ou + brierScores.brier_btts) / 3;
      // Map Brier to score: 0 = 100, 0.5 = 50, 1.0 = 0
      const mathScore = Math.max(0, Math.min(100, Math.round(100 - (combinedBrier * 100))));
      // Blend: 60% math, 40% AI self-assessment
      accuracyScore = Math.round(mathScore * 0.6 + accuracyScore * 0.4);
    }

    await supabase
      .from("matches")
      .update({ ai_post_match_review: review, ai_accuracy_score: accuracyScore })
      .eq("id", match_id);

    return new Response(JSON.stringify({
      success: true,
      review,
      accuracy_score: accuracyScore,
      brier_scores: brierScores,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Post-match review error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
