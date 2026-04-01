import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // Get teams missing logos
    const { data: teams, error } = await sb
      .from("teams")
      .select("id, name, country, league")
      .is("logo_url", null)
      .limit(20); // process in batches

    if (error) throw error;
    if (!teams?.length) {
      return new Response(JSON.stringify({ message: "All teams already have logos", updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${teams.length} teams without logos`);

    // Build a single AI prompt for all teams in this batch
    const teamList = teams.map((t) => `- ${t.name} (${t.country})`).join("\n");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a football data assistant. For each team listed, provide a direct URL to their official team crest/logo image. 
Use these sources in priority order:
1. Wikipedia/Wikimedia Commons SVG or PNG URLs (e.g. https://upload.wikimedia.org/wikipedia/en/...)
2. Any other publicly accessible direct image URL

Rules:
- Return ONLY a JSON array with objects containing "name" and "logo_url" fields
- The URL must be a direct link to an image file (ending in .svg, .png, .jpg, or similar)
- If you cannot find a logo for a team, set logo_url to null
- Do NOT wrap in markdown code blocks, return raw JSON only`,
          },
          {
            role: "user",
            content: `Find logo URLs for these football teams:\n${teamList}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_logos",
              description: "Return logo URLs for football teams",
              parameters: {
                type: "object",
                properties: {
                  logos: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        logo_url: { type: "string", nullable: true },
                      },
                      required: ["name", "logo_url"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["logos"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_logos" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      console.error("No tool call in AI response:", JSON.stringify(aiData));
      throw new Error("AI did not return structured data");
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const logos: Array<{ name: string; logo_url: string | null }> = parsed.logos;

    console.log(`AI returned ${logos.length} logo entries`);

    // Match AI results to teams and update
    let updated = 0;
    const results: Array<{ team: string; status: string }> = [];

    for (const team of teams) {
      // Find matching logo entry (fuzzy match on name)
      const match = logos.find(
        (l) =>
          l.logo_url &&
          (l.name.toLowerCase() === team.name.toLowerCase() ||
            l.name.toLowerCase().includes(team.name.toLowerCase()) ||
            team.name.toLowerCase().includes(l.name.toLowerCase()))
      );

      if (match?.logo_url) {
        const { error: updateErr } = await sb
          .from("teams")
          .update({ logo_url: match.logo_url })
          .eq("id", team.id);

        if (updateErr) {
          console.error(`Failed to update ${team.name}:`, updateErr);
          results.push({ team: team.name, status: "error" });
        } else {
          updated++;
          results.push({ team: team.name, status: "updated" });
          console.log(`✓ ${team.name} → ${match.logo_url}`);
        }
      } else {
        results.push({ team: team.name, status: "no_logo_found" });
        console.log(`✗ ${team.name} — no logo found`);
      }
    }

    // Check how many teams still need logos
    const { count } = await sb
      .from("teams")
      .select("id", { count: "exact", head: true })
      .is("logo_url", null);

    return new Response(
      JSON.stringify({
        updated,
        processed: teams.length,
        remaining: count ?? 0,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fix-team-logos error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
