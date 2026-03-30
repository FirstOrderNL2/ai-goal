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
    const { match_id } = await req.json();
    if (!match_id) {
      return new Response(JSON.stringify({ error: "match_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    if (match.status !== "completed") {
      return new Response(JSON.stringify({ error: "Match not completed yet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch prediction and odds
    const [{ data: prediction }, { data: odds }] = await Promise.all([
      supabase.from("predictions").select("*").eq("match_id", match_id).single(),
      supabase.from("odds").select("*").eq("match_id", match_id).single(),
    ]);

    const homeName = match.home_team?.name ?? "Home";
    const awayName = match.away_team?.name ?? "Away";

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
Over/Under 2.5: ${prediction.over_under_25}
Model confidence: ${Math.round(prediction.model_confidence * 100)}%` : ""}

${odds ? `ODDS: Home ${odds.home_win_odds}, Draw ${odds.draw_odds}, Away ${odds.away_win_odds}` : ""}

INSTRUCTIONS:
1. Compare your prediction against the actual result
2. Give yourself an accuracy score from 0-100 (be honest — 0 = completely wrong, 100 = perfect prediction)
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

    // Parse score from first line
    const lines = rawContent.trim().split("\n");
    let accuracyScore = 50; // default
    let review = rawContent;

    const firstLine = lines[0]?.trim();
    const parsed = parseInt(firstLine, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      accuracyScore = parsed;
      // Remove the score line and any blank lines after it
      review = lines.slice(1).join("\n").trim();
    }

    // Save to matches table
    await supabase
      .from("matches")
      .update({ ai_post_match_review: review, ai_accuracy_score: accuracyScore })
      .eq("id", match_id);

    return new Response(JSON.stringify({ success: true, review, accuracy_score: accuracyScore }), {
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
