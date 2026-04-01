import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TEAM_NAME_ALIASES: Record<string, string> = {
  "internazionale": "inter milan", "inter milano": "inter milan", "fc internazionale milano": "inter milan",
  "atletico de madrid": "atletico madrid", "atlético de madrid": "atletico madrid",
  "wolverhampton wanderers": "wolves", "tottenham hotspur": "tottenham",
  "west ham united": "west ham", "manchester city fc": "manchester city",
  "manchester united fc": "manchester united", "arsenal fc": "arsenal",
  "chelsea fc": "chelsea", "liverpool fc": "liverpool",
  "paris saint-germain": "psg", "paris saint-germain fc": "psg",
  "fc bayern münchen": "bayern munich", "bayern münchen": "bayern munich",
  "borussia dortmund": "dortmund", "real madrid cf": "real madrid",
  "fc barcelona": "barcelona", "juventus fc": "juventus",
  "ac milan": "milan", "ssc napoli": "napoli", "as roma": "roma",
  "olympique de marseille": "marseille", "olympique lyonnais": "lyon",
  // Dutch teams
  "ajax amsterdam": "ajax", "afc ajax": "ajax",
  "feyenoord rotterdam": "feyenoord",
  "psv eindhoven": "psv",
  "az alkmaar": "az",
  "fc twente": "twente", "fc twente enschede": "twente",
  "fc utrecht": "utrecht",
  "sc heerenveen": "heerenveen",
  "fc groningen": "groningen",
  "vitesse arnhem": "vitesse",
  "sparta rotterdam": "sparta rotterdam",
  "nec nijmegen": "nec",
  "go ahead eagles": "go ahead eagles",
  "rkc waalwijk": "rkc waalwijk",
  "fortuna sittard": "fortuna sittard",
  "pec zwolle": "pec zwolle",
  "heracles almelo": "heracles",
  "willem ii tilburg": "willem ii", "willem ii": "willem ii",
  "nac breda": "nac breda",
  "almere city fc": "almere city",
};

function resolveTeamName(name: string): string {
  const lower = name.toLowerCase().trim();
  return TEAM_NAME_ALIASES[lower] ?? lower;
}

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

    const summary = { matchesCreated: 0, teamsCreated: 0, errors: [] as string[], sources: [] as string[] };

    // Scrape both sources
    const urls = [
      "https://www.iservoetbalvanavond.nl/",
      "https://www.vi.nl/wedstrijden",
    ];

    let allMarkdown = "";

    for (const url of urls) {
      try {
        const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url,
            formats: ["markdown"],
            onlyMainContent: true,
            waitFor: 3000,
          }),
        });

        if (!scrapeRes.ok) {
          const errText = await scrapeRes.text();
          summary.errors.push(`Scrape ${url} failed: ${scrapeRes.status} ${errText}`);
          continue;
        }

        const scrapeData = await scrapeRes.json();
        const markdown = scrapeData?.data?.markdown || scrapeData?.markdown || "";
        if (markdown) {
          allMarkdown += `\n\n=== SOURCE: ${url} ===\n${markdown}`;
          summary.sources.push(url);
        }
      } catch (e) {
        summary.errors.push(`Scrape error ${url}: ${e.message}`);
      }
    }

    if (!allMarkdown) {
      return new Response(JSON.stringify({ success: false, message: "No content scraped", summary }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use AI to extract structured match data
    const today = new Date().toISOString().substring(0, 10);
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
            content: `You extract football match data from web content. Today's date is ${today}. Extract ALL matches you can find — today's, tomorrow's, and upcoming ones. For each match identify the home team, away team, date/time, and competition/league name. Use the extract_matches tool.`,
          },
          {
            role: "user",
            content: `Extract all football matches from this content:\n\n${allMarkdown.substring(0, 15000)}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_matches",
            description: "Extract structured match data from scraped content",
            parameters: {
              type: "object",
              properties: {
                matches: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      home_team: { type: "string", description: "Home team name" },
                      away_team: { type: "string", description: "Away team name" },
                      date: { type: "string", description: "Match date in YYYY-MM-DD format" },
                      time: { type: "string", description: "Kick-off time in HH:MM format (24h, CET/CEST)" },
                      competition: { type: "string", description: "Competition name (e.g. Champions League, Eredivisie, Premier League)" },
                    },
                    required: ["home_team", "away_team", "date", "competition"],
                  },
                },
              },
              required: ["matches"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_matches" } },
      }),
    });

    if (!aiRes.ok) {
      const aiErr = await aiRes.text();
      throw new Error(`AI extraction failed: ${aiRes.status} ${aiErr}`);
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ success: false, message: "AI returned no matches", summary }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    const matches = extracted.matches || [];

    if (matches.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No matches found in scraped content", summary }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load existing teams
    const { data: existingTeams } = await supabase.from("teams").select("id, name");
    const teamsByName = new Map<string, any>();
    existingTeams?.forEach((t) => {
      teamsByName.set(resolveTeamName(t.name), t);
    });

    async function findOrCreateTeam(name: string, league: string): Promise<string | null> {
      const resolved = resolveTeamName(name);
      if (teamsByName.has(resolved)) return teamsByName.get(resolved).id;

      // Try exact match too
      const exactLower = name.toLowerCase().trim();
      if (teamsByName.has(exactLower)) return teamsByName.get(exactLower).id;

      // Create new team
      const country = league.includes("Eredivisie") || league.includes("KNVB") ? "Netherlands" :
        league.includes("Champions League") || league.includes("Europa") ? "Europe" : "Unknown";

      const { data: newTeam, error } = await supabase
        .from("teams")
        .insert({ name, league, country })
        .select("id, name")
        .single();

      if (error) {
        summary.errors.push(`Team create error (${name}): ${error.message}`);
        return null;
      }

      teamsByName.set(resolveTeamName(newTeam.name), newTeam);
      summary.teamsCreated++;
      return newTeam.id;
    }

    // Map competition names to our league labels
    function mapCompetition(comp: string): string {
      const c = comp.toLowerCase();
      if (c.includes("champions league") || c.includes("ucl")) return "Champions League";
      if (c.includes("europa league") || c.includes("uel")) return "Europa League";
      if (c.includes("conference league") || c.includes("uecl")) return "Conference League";
      if (c.includes("eredivisie")) return "Eredivisie";
      if (c.includes("premier league")) return "Premier League";
      if (c.includes("la liga") || c.includes("laliga")) return "La Liga";
      if (c.includes("serie a")) return "Serie A";
      if (c.includes("bundesliga")) return "Bundesliga";
      if (c.includes("ligue 1")) return "Ligue 1";
      if (c.includes("knvb") || c.includes("beker")) return "KNVB Beker";
      if (c.includes("world cup") || c.includes("wk")) return "World Cup 2026";
      return comp; // Keep original if no match
    }

    // Insert matches
    for (const m of matches) {
      try {
        const homeId = await findOrCreateTeam(m.home_team, m.competition);
        const awayId = await findOrCreateTeam(m.away_team, m.competition);
        if (!homeId || !awayId) continue;

        const league = mapCompetition(m.competition);
        const matchDate = m.time
          ? `${m.date}T${m.time}:00+02:00`
          : `${m.date}T20:00:00+02:00`;

        // Check if match already exists (same teams, same date)
        const dateKey = m.date;
        const { data: existing } = await supabase
          .from("matches")
          .select("id")
          .eq("team_home_id", homeId)
          .eq("team_away_id", awayId)
          .gte("match_date", `${dateKey}T00:00:00Z`)
          .lte("match_date", `${dateKey}T23:59:59Z`)
          .limit(1);

        if (existing && existing.length > 0) continue;

        const { error: insertErr } = await supabase.from("matches").insert({
          team_home_id: homeId,
          team_away_id: awayId,
          match_date: matchDate,
          league,
          status: "upcoming",
        });

        if (insertErr) {
          summary.errors.push(`Match insert error (${m.home_team} vs ${m.away_team}): ${insertErr.message}`);
        } else {
          summary.matchesCreated++;
        }
      } catch (e) {
        summary.errors.push(`Match processing error: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      extracted: matches.length,
      summary,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("scrape-matches error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
