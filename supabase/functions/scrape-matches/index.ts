import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Dutch → English team name mapping + standard aliases
const TEAM_NAME_MAP: Record<string, string> = {
  // Dutch national team names
  "brazilië": "brazil", "verenigde staten": "usa", "kroatië": "croatia",
  "duitsland": "germany", "engeland": "england", "spanje": "spain",
  "frankrijk": "france", "italië": "italy", "portugal": "portugal",
  "nederland": "netherlands", "belgiё": "belgium", "zwitserland": "switzerland",
  "oostenrijk": "austria", "denemarken": "denmark", "zweden": "sweden",
  "noorwegen": "norway", "polen": "poland", "tsjechië": "czech republic",
  "roemenië": "romania", "griekenland": "greece", "turkije": "turkiye",
  "schotland": "scotland", "wales": "wales", "ierland": "ireland",
  "japan": "japan", "zuid-korea": "south korea", "australië": "australia",
  "argentinië": "argentina", "colombia": "colombia", "mexico": "mexico",
  "canada": "canada", "uruguay": "uruguay", "chili": "chile",
  "peru": "peru", "ecuador": "ecuador", "venezuela": "venezuela",
  // Club aliases
  "internazionale": "inter milan", "inter milano": "inter milan", "fc internazionale milano": "inter milan",
  "atletico de madrid": "atletico madrid", "atlético de madrid": "atletico madrid",
  "wolverhampton wanderers": "wolves", "tottenham hotspur": "tottenham",
  "west ham united": "west ham", "manchester city fc": "manchester city",
  "manchester united fc": "manchester united", "arsenal fc": "arsenal",
  "chelsea fc": "chelsea", "liverpool fc": "liverpool",
  "paris saint-germain": "psg", "paris saint-germain fc": "psg", "paris saint-germain f.c.": "psg",
  "fc bayern münchen": "bayern munich", "bayern münchen": "bayern munich",
  "borussia dortmund": "dortmund", "real madrid cf": "real madrid",
  "fc barcelona": "barcelona", "juventus fc": "juventus",
  "ac milan": "milan", "ssc napoli": "napoli", "as roma": "roma",
  "olympique de marseille": "marseille", "olympique lyonnais": "lyon",
  // Dutch clubs
  "ajax amsterdam": "ajax", "afc ajax": "ajax",
  "feyenoord rotterdam": "feyenoord", "psv eindhoven": "psv",
  "az alkmaar": "az", "fc twente": "twente", "fc twente enschede": "twente",
  "fc utrecht": "utrecht", "sc heerenveen": "heerenveen",
  "fc groningen": "groningen", "vitesse arnhem": "vitesse",
  "sparta rotterdam": "sparta rotterdam", "nec nijmegen": "nec",
  "heracles almelo": "heracles", "willem ii tilburg": "willem ii",
  "almere city fc": "almere city",
};

function resolveTeamName(name: string): string {
  // Strip "Vrouwen" suffix
  let cleaned = name.replace(/\s*Vrouwen\s*/gi, "").trim();
  const lower = cleaned.toLowerCase().trim();
  return TEAM_NAME_MAP[lower] ?? lower;
}

function isWomensTeam(name: string): boolean {
  return /vrouwen/i.test(name);
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

    const summary = { matchesCreated: 0, teamsCreated: 0, skippedWomens: 0, errors: [] as string[], sources: [] as string[] };

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
          body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 3000 }),
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
    const nowUtc = new Date().toISOString();
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
            content: `You extract football match data from web content. The current UTC time is ${nowUtc}. The scraped content comes from Dutch websites where times are displayed in CET/CEST (Europe/Amsterdam timezone, UTC+1 in winter, UTC+2 in summer). IMPORTANT: When extracting dates, be precise — do NOT use relative terms like "today" or "tomorrow". Use the actual calendar date shown on the page. If a match has already been played (date/time is before ${nowUtc}), include the score if available. Extract ALL matches — upcoming, today's, and recently completed ones. Translate all Dutch team names to English. IMPORTANT: Extract round/leg information when available (e.g. "Quarter-final Leg 1", "Kwartfinale wedstrijd 2 van 2" → "QF Leg 2", "Halve finale" → "Semi-final"). For two-legged ties, always include which leg it is. Use the extract_matches tool.`,
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
                      home_team: { type: "string", description: "Home team name in English" },
                      away_team: { type: "string", description: "Away team name in English" },
                      date: { type: "string", description: "Match date in YYYY-MM-DD format" },
                      time: { type: "string", description: "Kick-off time in HH:MM format (24h, CET/CEST)" },
                      competition: { type: "string", description: "Competition name in English (e.g. Champions League, Eredivisie, Premier League)" },
                      is_womens: { type: "boolean", description: "True if this is a women's match" },
                      score_home: { type: "number", description: "Final score for home team, if match is completed" },
                      score_away: { type: "number", description: "Final score for away team, if match is completed" },
                      round: { type: "string", description: "Round/leg info, e.g. 'QF Leg 1', 'Semi-final Leg 2', 'Matchday 30'. Include leg number for two-legged ties." },
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
    const teamsByResolved = new Map<string, any>();
    existingTeams?.forEach((t) => {
      teamsByResolved.set(resolveTeamName(t.name), t);
    });

    async function findOrCreateTeam(name: string, league: string): Promise<string | null> {
      const resolved = resolveTeamName(name);

      // Check resolved name
      if (teamsByResolved.has(resolved)) return teamsByResolved.get(resolved).id;

      // Fuzzy: try ILIKE search in DB
      const { data: fuzzyMatch } = await supabase
        .from("teams")
        .select("id, name")
        .ilike("name", `%${resolved}%`)
        .limit(1);

      if (fuzzyMatch && fuzzyMatch.length > 0) {
        teamsByResolved.set(resolved, fuzzyMatch[0]);
        return fuzzyMatch[0].id;
      }

      // Create new team
      const country = league.includes("Eredivisie") || league.includes("KNVB") ? "Netherlands" :
        league.includes("Champions League") || league.includes("Europa") ? "Europe" :
        league.includes("Premier League") ? "England" :
        league.includes("La Liga") ? "Spain" :
        league.includes("Serie A") ? "Italy" :
        league.includes("Bundesliga") ? "Germany" :
        league.includes("Ligue 1") ? "France" : "Unknown";

      const { data: newTeam, error } = await supabase
        .from("teams")
        .insert({ name, league, country })
        .select("id, name")
        .single();

      if (error) {
        summary.errors.push(`Team create error (${name}): ${error.message}`);
        return null;
      }

      teamsByResolved.set(resolved, newTeam);
      summary.teamsCreated++;
      return newTeam.id;
    }

    function mapCompetition(comp: string, isWomens?: boolean): string {
      const c = comp.toLowerCase();
      if (isWomens) {
        if (c.includes("champions league")) return "Women's Champions League";
        return `Women's ${comp}`;
      }
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
      if (c.includes("keuken kampioen")) return "Keuken Kampioen Divisie";
      if (c.includes("friendly") || c.includes("vriendschappelijk")) return "Friendlies";
      return comp;
    }

    // Insert matches
    for (const m of matches) {
      try {
        // Skip women's matches
        const womens = m.is_womens || isWomensTeam(m.home_team) || isWomensTeam(m.away_team);

        const league = mapCompetition(m.competition, womens);
        const homeId = await findOrCreateTeam(m.home_team, league);
        const awayId = await findOrCreateTeam(m.away_team, league);
        if (!homeId || !awayId) continue;

        // Determine CET/CEST offset: CEST (UTC+2) from last Sunday of March to last Sunday of October
        function getCetOffset(dateStr: string): string {
          const d = new Date(dateStr);
          const month = d.getMonth(); // 0-indexed
          if (month > 2 && month < 9) return "+02:00"; // Apr-Sep always CEST
          if (month < 2 || month > 9) return "+01:00"; // Jan-Feb, Nov-Dec always CET
          // March or October: check last Sunday
          const lastDay = new Date(d.getFullYear(), month + 1, 0).getDate();
          const lastSunday = lastDay - new Date(d.getFullYear(), month, lastDay).getDay();
          if (month === 2) return d.getDate() >= lastSunday ? "+02:00" : "+01:00";
          return d.getDate() < lastSunday ? "+02:00" : "+01:00";
        }

        const cetOffset = getCetOffset(m.date);
        const matchDate = m.time
          ? `${m.date}T${m.time}:00${cetOffset}`
          : `${m.date}T20:00:00${cetOffset}`;

        // Check if match already exists (same teams, +/- 1 day window for dedup)
        // But skip dedup if round/leg info differs (two-legged ties are NOT duplicates)
        const matchDateObj = new Date(matchDate);
        const dayBefore = new Date(matchDateObj.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const dayAfter = new Date(matchDateObj.getTime() + 24 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await supabase
          .from("matches")
          .select("id, round")
          .eq("team_home_id", homeId)
          .eq("team_away_id", awayId)
          .gte("match_date", dayBefore)
          .lte("match_date", dayAfter)
          .limit(5);

        const extractedRound = m.round || null;
        
        // Find a true duplicate: same round, or both have no round info
        const trueDuplicate = existing?.find((ex: any) => {
          const exRound = ex.round || null;
          // If both have round info and they differ, NOT a duplicate (e.g. Leg 1 vs Leg 2)
          if (extractedRound && exRound && extractedRound !== exRound) return false;
          // If one has round info and the other doesn't, treat as potential duplicate
          // If both null or both match, it's a duplicate
          return true;
        });

        if (trueDuplicate) {
          // If match exists and we have scores, update them
          if (m.score_home != null && m.score_away != null) {
            const { error: updateErr } = await supabase.from("matches").update({
              goals_home: m.score_home,
              goals_away: m.score_away,
              status: "completed",
              round: extractedRound || trueDuplicate.round,
            }).eq("id", trueDuplicate.id);
            if (!updateErr) summary.matchesCreated++;
          }
          continue;
        }

        // For past matches without scores, skip creation
        if (new Date(matchDate) < new Date() && m.score_home == null) continue;

        const matchInsert: any = {
          team_home_id: homeId,
          team_away_id: awayId,
          match_date: matchDate,
          league,
          status: m.score_home != null ? "completed" : "upcoming",
          round: extractedRound,
        };

        if (m.score_home != null && m.score_away != null) {
          matchInsert.goals_home = m.score_home;
          matchInsert.goals_away = m.score_away;
        }

        const { error: insertErr } = await supabase.from("matches").insert(matchInsert);

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
