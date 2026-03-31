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
    const { home_team, away_team, league, match_date } = await req.json();
    if (!home_team || !away_team) {
      return new Response(JSON.stringify({ error: "home_team and away_team required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not set");

    const prompt = `You are a football research assistant. Search the web for the latest information about this upcoming match:

${home_team} vs ${away_team}
League: ${league || "Unknown"}
Date: ${match_date || "Upcoming"}

Find and report the following for BOTH teams:

1. INJURED PLAYERS: Who is currently injured? What is the expected return date?
2. SUSPENDED PLAYERS: Who is suspended for this match (yellow card accumulation, red cards)?
3. EXPECTED LINEUPS: What is the predicted starting XI for each team?
4. RECENT FORM & MORALE: How has each team been performing in their last 3-5 matches? Any notable wins/losses?
5. TEAM NEWS: Any recent manager changes, key transfers, dressing room issues, or tactical shifts?
6. HEAD-TO-HEAD: Recent head-to-head record between these two teams
7. WEATHER: Expected weather conditions at the venue on match day
8. KEY STATS: Any relevant statistics (goals scored/conceded, clean sheets, home/away record this season)

Be specific with player names and dates. If you cannot find information on a topic, say so explicitly rather than guessing. Cite your sources when possible.

Format as plain text paragraphs, not markdown.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errText = await aiResponse.text();
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again later.", context: "" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted.", context: "" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI API error: ${status} ${errText}`);
    }

    const aiData = await aiResponse.json();
    const context = aiData.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ context }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-match-context error:", error);
    return new Response(JSON.stringify({ error: error.message, context: "" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
