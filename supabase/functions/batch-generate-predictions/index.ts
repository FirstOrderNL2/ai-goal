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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not set");

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const limit = body.limit ?? 10;
    const mode = body.mode ?? "upcoming"; // "upcoming" or "review"

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

    // Get form data for all teams involved
    const teamIds = [...new Set(needsPrediction.flatMap((m: any) => [m.team_home_id, m.team_away_id]))];
    const { data: recentMatches } = await supabase
      .from("matches")
      .select("team_home_id, team_away_id, goals_home, goals_away, status")
      .eq("status", "completed")
      .or(teamIds.map(id => `team_home_id.eq.${id},team_away_id.eq.${id}`).join(","))
      .order("match_date", { ascending: false })
      .limit(500);

    // Build form lookup
    const formMap = new Map<string, string[]>();
    for (const tid of teamIds) {
      const teamMatches = (recentMatches || [])
        .filter((m: any) => m.team_home_id === tid || m.team_away_id === tid)
        .slice(0, 5);
      const form = teamMatches.map((m: any) => {
        const isHome = m.team_home_id === tid;
        const gf = isHome ? m.goals_home : m.goals_away;
        const ga = isHome ? m.goals_away : m.goals_home;
        return (gf ?? 0) > (ga ?? 0) ? "W" : (gf ?? 0) === (ga ?? 0) ? "D" : "L";
      });
      formMap.set(tid, form);
    }

    let generated = 0;
    const errors: string[] = [];

    for (const match of needsPrediction) {
      const homeName = (match as any).home_team?.name ?? "Home";
      const awayName = (match as any).away_team?.name ?? "Away";
      const homeForm = formMap.get(match.team_home_id) || [];
      const awayForm = formMap.get(match.team_away_id) || [];

      const prompt = `Analyze this football match and provide a prediction.

Match: ${homeName} vs ${awayName}
League: ${match.league}
Date: ${match.match_date}
${homeName} recent form (last 5): ${homeForm.join(", ") || "Unknown"}
${awayName} recent form (last 5): ${awayForm.join(", ") || "Unknown"}

Call the predict_match function with your analysis.`;

      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "You are an expert football analyst. Use team form, league context, and home advantage to make calibrated predictions. Be data-driven." },
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
                    over_under_25: { type: "string", enum: ["over", "under"], description: "Over or under 2.5 total goals" },
                    confidence: { type: "number", description: "Model confidence 0-1 based on data quality" },
                  },
                  required: ["home_win", "draw", "away_win", "expected_goals_home", "expected_goals_away", "over_under_25", "confidence"],
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

        // Normalize probabilities to sum to 1
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
          over_under_25: pred.over_under_25 || "under",
          model_confidence: Math.round((pred.confidence || 0.5) * 1000) / 1000,
        }, { onConflict: "match_id" });

        if (upsertErr) {
          errors.push(`DB error for ${homeName} vs ${awayName}: ${upsertErr.message}`);
        } else {
          generated++;
        }

        // Rate limit protection
        await new Promise(r => setTimeout(r, 1500));
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
  // Find completed matches without reviews
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
