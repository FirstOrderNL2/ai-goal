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
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlKey) throw new Error("FIRECRAWL_API_KEY not set");

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Scrape VI.nl news
    const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: "https://www.vi.nl/nieuws/net-binnen",
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!scrapeRes.ok) {
      const errText = await scrapeRes.text();
      throw new Error(`Scrape failed: ${scrapeRes.status} ${errText}`);
    }

    const scrapeData = await scrapeRes.json();
    const markdown = scrapeData?.data?.markdown || scrapeData?.markdown || "";

    if (!markdown) {
      return new Response(JSON.stringify({ success: false, message: "No news content scraped" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use AI to extract football-relevant news items
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You extract football news that is relevant for match predictions. Focus on: injuries, suspensions, transfers, tactical changes, manager news, team form, key player availability. Ignore opinion pieces, fan stories, or non-match-relevant items. Use the extract_news tool.`,
          },
          {
            role: "user",
            content: `Extract prediction-relevant football news from this VI.nl content:\n\n${markdown.substring(0, 12000)}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_news",
            description: "Extract prediction-relevant football news items",
            parameters: {
              type: "object",
              properties: {
                news_items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      headline: { type: "string", description: "News headline" },
                      summary: { type: "string", description: "Brief summary of prediction-relevant details" },
                      teams_involved: {
                        type: "array",
                        items: { type: "string" },
                        description: "Team names mentioned",
                      },
                      impact_type: {
                        type: "string",
                        enum: ["injury", "suspension", "transfer", "tactical", "form", "other"],
                        description: "Type of impact on predictions",
                      },
                      impact_level: {
                        type: "string",
                        enum: ["high", "medium", "low"],
                        description: "How much this affects match predictions",
                      },
                    },
                    required: ["headline", "summary", "teams_involved", "impact_type", "impact_level"],
                  },
                },
              },
              required: ["news_items"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_news" } },
      }),
    });

    if (!aiRes.ok) {
      const aiErr = await aiRes.text();
      throw new Error(`AI extraction failed: ${aiRes.status} ${aiErr}`);
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ success: true, news_items: [], message: "No relevant news extracted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    const newsItems = extracted.news_items || [];

    // Store news context on relevant upcoming matches
    // Find teams mentioned in news and update their upcoming matches with context
    let updatedMatches = 0;
    const { data: teams } = await supabase.from("teams").select("id, name");
    const teamNameMap = new Map<string, string>();
    teams?.forEach((t) => {
      teamNameMap.set(t.name.toLowerCase(), t.id);
    });

    for (const item of newsItems) {
      if (item.impact_level === "low") continue;

      for (const teamName of item.teams_involved) {
        const teamId = teamNameMap.get(teamName.toLowerCase());
        if (!teamId) continue;

        // Find upcoming matches for this team
        const { data: upcomingMatches } = await supabase
          .from("matches")
          .select("id, ai_insights")
          .eq("status", "upcoming")
          .or(`team_home_id.eq.${teamId},team_away_id.eq.${teamId}`)
          .order("match_date", { ascending: true })
          .limit(3);

        for (const match of upcomingMatches || []) {
          const existingInsights = match.ai_insights || "";
          const newsContext = `[NEWS] ${item.headline}: ${item.summary}`;

          // Don't duplicate
          if (existingInsights.includes(item.headline)) continue;

          const updated = existingInsights
            ? `${existingInsights}\n${newsContext}`
            : newsContext;

          await supabase
            .from("matches")
            .update({ ai_insights: updated })
            .eq("id", match.id);

          updatedMatches++;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      news_items: newsItems.length,
      high_impact: newsItems.filter((n: any) => n.impact_level === "high").length,
      matches_updated: updatedMatches,
      items: newsItems,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("scrape-news error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
