import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://v3.football.api-sports.io";

const LEAGUE_IDS: Record<string, number> = {
  "Premier League": 39,
  "La Liga": 140,
  "Serie A": 135,
  "Bundesliga": 78,
  "Ligue 1": 61,
};

async function apiFootballFetch(path: string, apiKey: string): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "x-apisports-key": apiKey },
    });
    if (!res.ok) {
      console.error(`API-Football error ${res.status} for ${path}`);
      return [];
    }
    const json = await res.json();
    return json.response ?? [];
  } catch (e) {
    console.error(`API-Football fetch failed for ${path}:`, e);
    return [];
  }
}

// Extract structured injury data from API-Football response
function extractInjuries(injuries: any[], teamApiId?: number | null): { home: any[]; away: any[] } {
  const home: any[] = [];
  const away: any[] = [];
  for (const i of injuries) {
    const entry = {
      player: i.player?.name ?? "Unknown",
      type: i.player?.type ?? "",
      reason: i.player?.reason ?? "",
      team: i.team?.name ?? "",
      team_id: i.team?.id,
    };
    // If we have team API IDs, categorize properly
    if (teamApiId && i.team?.id === teamApiId) {
      home.push(entry);
    } else {
      away.push(entry);
    }
  }
  return { home, away };
}

// Extract structured lineup data with bench
function extractLineups(lineups: any[]): { home: any; away: any } {
  const result: { home: any; away: any } = { home: null, away: null };
  lineups.forEach((l: any, idx: number) => {
    const starters = (l.startXI ?? []).map((p: any) => ({
      name: p.player?.name ?? "?",
      number: p.player?.number ?? null,
      pos: p.player?.pos ?? null,
    }));
    const bench = (l.substitutes ?? []).map((p: any) => ({
      name: p.player?.name ?? "?",
      number: p.player?.number ?? null,
      pos: p.player?.pos ?? null,
    }));
    const entry = {
      team: l.team?.name ?? "Unknown",
      formation: l.formation ?? "?",
      starters,
      bench,
      captain: starters.find((_: any, i: number) => i === 0)?.name ?? null,
    };
    if (idx === 0) result.home = entry;
    else result.away = entry;
  });
  return result;
}

function formatInjuries(injuries: any[]): string {
  if (!injuries.length) return "";
  const lines = injuries.map((i: any) => {
    const player = i.player?.name ?? "Unknown";
    const team = i.team?.name ?? "";
    const type = i.player?.type ?? "";
    const reason = i.player?.reason ?? "";
    return `- ${player} (${team}): ${type}${reason ? ` — ${reason}` : ""}`;
  });
  return `INJURIES (from API-Football):\n${lines.join("\n")}`;
}

function formatLineups(lineups: any[]): string {
  if (!lineups.length) return "";
  const parts = lineups.map((l: any) => {
    const team = l.team?.name ?? "Unknown";
    const formation = l.formation ?? "?";
    const starters = (l.startXI ?? []).map((p: any) => p.player?.name ?? "?").join(", ");
    const bench = (l.substitutes ?? []).map((p: any) => p.player?.name ?? "?").join(", ");
    return `${team} (${formation}): ${starters}\n  Bench: ${bench || "N/A"}`;
  });
  return `CONFIRMED LINEUPS:\n${parts.join("\n")}`;
}

function formatEvents(events: any[]): string {
  if (!events.length) return "";
  const lines = events.map((e: any) => {
    const time = e.time?.elapsed ?? "?";
    const extra = e.time?.extra ? `+${e.time.extra}` : "";
    const team = e.team?.name ?? "";
    const player = e.player?.name ?? "?";
    const type = e.type ?? "";
    const detail = e.detail ?? "";
    return `${time}${extra}' [${team}] ${type}: ${player}${detail ? ` (${detail})` : ""}`;
  });
  return `MATCH EVENTS:\n${lines.join("\n")}`;
}

function formatLiveStatus(fixture: any): string {
  if (!fixture) return "";
  const status = fixture.fixture?.status;
  const goals = fixture.goals;
  if (!status) return "";
  const elapsed = status.elapsed ?? 0;
  const short = status.short ?? "";
  const home = fixture.teams?.home?.name ?? "Home";
  const away = fixture.teams?.away?.name ?? "Away";
  return `LIVE STATUS: ${home} ${goals?.home ?? 0}-${goals?.away ?? 0} ${away} | ${short} ${elapsed}'`;
}

function formatPredictions(preds: any[]): string {
  if (!preds.length) return "";
  const p = preds[0];
  const winner = p.predictions?.winner?.name ?? "N/A";
  const advice = p.predictions?.advice ?? "";
  const homeForm = p.teams?.home?.league?.form ?? "";
  const awayForm = p.teams?.away?.league?.form ?? "";
  const homeAtk = p.comparison?.att?.home ?? "";
  const awayAtk = p.comparison?.att?.away ?? "";
  const homeDef = p.comparison?.def?.home ?? "";
  const awayDef = p.comparison?.def?.away ?? "";
  return `API-FOOTBALL PREDICTION:
Predicted winner: ${winner}
Advice: ${advice}
Home form: ${homeForm} | Away form: ${awayForm}
Attack comparison: Home ${homeAtk} vs Away ${awayAtk}
Defense comparison: Home ${homeDef} vs Away ${awayDef}`;
}

// ── Firecrawl scraping ──
async function scrapeWithFirecrawl(url: string, firecrawlKey: string): Promise<string> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
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
    if (!res.ok) {
      console.error(`Firecrawl error ${res.status} for ${url}`);
      return "";
    }
    const data = await res.json();
    const md = data.data?.markdown || data.markdown || "";
    return md.slice(0, 4000);
  } catch (e) {
    console.error(`Firecrawl fetch failed for ${url}:`, e);
    return "";
  }
}

async function scrapeFirecrawlContext(
  homeName: string, awayName: string, league: string, firecrawlKey: string
): Promise<string> {
  const parts: string[] = [];

  const searchQueries = [
    `${homeName} ${awayName} opstelling blessures`,
    `${homeName} ${awayName} lineup injuries team news`,
  ];

  for (const query of searchQueries) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          limit: 3,
          tbs: "qdr:w",
          scrapeOptions: { formats: ["markdown"] },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const results = data.data || [];
        for (const r of results) {
          if (r.markdown) {
            parts.push(`[SOURCE: ${r.url || "web"}]\n${r.markdown.slice(0, 2000)}`);
          }
        }
      }
    } catch (e) {
      console.error(`Firecrawl search failed for "${query}":`, e);
    }
  }

  // Injury news scraping
  const injuryScrapes = [homeName, awayName].map(async (teamName) => {
    try {
      const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `${teamName} injury news squad update 2026`,
          limit: 2,
          tbs: "qdr:w",
          scrapeOptions: { formats: ["markdown"] },
        }),
      });
      if (searchRes.ok) {
        const data = await searchRes.json();
        const results = data.data || [];
        for (const r of results) {
          if (r.markdown) {
            parts.push(`[SOURCE: ${r.url || "injury news"} - ${teamName}]\n${r.markdown.slice(0, 2000)}`);
          }
        }
      }
    } catch (e) {
      console.error(`Injury scrape failed for ${teamName}:`, e);
    }
  });

  // WhoScored preview
  const whoScoredScrape = (async () => {
    try {
      const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `site:whoscored.com ${homeName} vs ${awayName} preview`,
          limit: 1,
          scrapeOptions: { formats: ["markdown"] },
        }),
      });
      if (searchRes.ok) {
        const data = await searchRes.json();
        const results = data.data || [];
        if (results[0]?.markdown) {
          parts.push(`[SOURCE: WhoScored - ${homeName} vs ${awayName}]\n${results[0].markdown.slice(0, 3000)}`);
        }
      }
    } catch (e) {
      console.error(`WhoScored scrape failed:`, e);
    }
  })();

  const todayScrape = (async () => {
    try {
      const todayPage = await scrapeWithFirecrawl("https://www.iservoetbalvanavond.nl", firecrawlKey);
      if (todayPage && (todayPage.toLowerCase().includes(homeName.toLowerCase()) || todayPage.toLowerCase().includes(awayName.toLowerCase()))) {
        parts.push(`[SOURCE: iservoetbalvanavond.nl]\n${todayPage}`);
      }
    } catch (_) {}
  })();

  await Promise.all([...injuryScrapes, whoScoredScrape, todayScrape]);

  return parts.length > 0 ? `LIVE WEB SCRAPED DATA:\n\n${parts.join("\n\n")}` : "";
}

// ── Use AI tool calling to extract structured fields from raw context ──
async function extractStructuredContext(
  rawContext: string, homeName: string, awayName: string, lovableApiKey: string
): Promise<{
  injuries_home: any[];
  injuries_away: any[];
  lineup_home: any[];
  lineup_away: any[];
  suspensions: any[];
  weather: string | null;
  news_items: any[];
}> {
  const defaultResult = {
    injuries_home: [], injuries_away: [], lineup_home: [], lineup_away: [],
    suspensions: [], weather: null, news_items: [],
  };

  if (!rawContext || rawContext.length < 50) return defaultResult;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You extract structured match data from raw text. Extract ONLY what is explicitly mentioned. Do not invent data. Call the extract_match_data tool.`,
          },
          {
            role: "user",
            content: `Extract structured data for ${homeName} vs ${awayName} from this context:\n\n${rawContext.slice(0, 8000)}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_match_data",
            description: "Extract structured match context data",
            parameters: {
              type: "object",
              properties: {
                injuries_home: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      player: { type: "string" },
                      reason: { type: "string" },
                      expected_return: { type: "string" },
                    },
                    required: ["player", "reason"],
                  },
                  description: `Injured players for ${homeName}`,
                },
                injuries_away: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      player: { type: "string" },
                      reason: { type: "string" },
                      expected_return: { type: "string" },
                    },
                    required: ["player", "reason"],
                  },
                  description: `Injured players for ${awayName}`,
                },
                lineup_home: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      player: { type: "string" },
                      position: { type: "string" },
                    },
                    required: ["player"],
                  },
                  description: `Expected/confirmed starting lineup for ${homeName}`,
                },
                lineup_away: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      player: { type: "string" },
                      position: { type: "string" },
                    },
                    required: ["player"],
                  },
                  description: `Expected/confirmed starting lineup for ${awayName}`,
                },
                suspensions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      player: { type: "string" },
                      team: { type: "string" },
                      reason: { type: "string" },
                    },
                    required: ["player", "team"],
                  },
                  description: "Suspended players for either team",
                },
                weather: { type: "string", description: "Weather conditions if mentioned (e.g. 'Rain, 12°C')" },
                news_items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      headline: { type: "string" },
                      summary: { type: "string" },
                      source: { type: "string" },
                    },
                    required: ["headline"],
                  },
                  description: "Key news items relevant to this match",
                },
              },
              required: ["injuries_home", "injuries_away", "lineup_home", "lineup_away", "suspensions", "news_items"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_match_data" } },
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      console.error(`AI extraction error: ${res.status}`);
      return defaultResult;
    }

    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return defaultResult;

    const extracted = JSON.parse(toolCall.function.arguments);
    return {
      injuries_home: extracted.injuries_home || [],
      injuries_away: extracted.injuries_away || [],
      lineup_home: extracted.lineup_home || [],
      lineup_away: extracted.lineup_away || [],
      suspensions: extracted.suspensions || [],
      weather: extracted.weather || null,
      news_items: extracted.news_items || [],
    };
  } catch (e) {
    console.error("Structured extraction failed:", e);
    return defaultResult;
  }
}

// ── Cache context to match_context table with structured fields ──
async function cacheContext(
  supabase: any, matchId: string | undefined, contextText: string,
  structured: {
    injuries_home: any[]; injuries_away: any[];
    lineup_home: any[]; lineup_away: any[];
    suspensions: any[]; weather: string | null; news_items: any[];
  }
) {
  if (!matchId) return;
  try {
    await supabase.from("match_context").upsert({
      match_id: matchId,
      h2h_summary: contextText.slice(0, 10000),
      injuries_home: structured.injuries_home,
      injuries_away: structured.injuries_away,
      lineup_home: structured.lineup_home,
      lineup_away: structured.lineup_away,
      suspensions: structured.suspensions,
      weather: structured.weather,
      news_items: structured.news_items,
      scraped_at: new Date().toISOString(),
    }, { onConflict: "match_id" });
  } catch (e) {
    console.error("Cache context error:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { home_team, away_team, league, match_date, api_football_id, home_team_api_id, away_team_api_id, match_id } = await req.json();
    if (!home_team || !away_team) {
      return new Response(JSON.stringify({ error: "home_team and away_team required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("API_FOOTBALL_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

    // Check cache first (if less than 6 hours old)
    if (supabase && match_id) {
      const { data: cached } = await supabase
        .from("match_context")
        .select("*")
        .eq("match_id", match_id)
        .single();

      if (cached?.scraped_at) {
        const age = Date.now() - new Date(cached.scraped_at).getTime();
        // Return cache if <6h AND has structured data populated
        const hasStructured = (cached.injuries_home?.length > 0 || cached.injuries_away?.length > 0 ||
          cached.lineup_home?.length > 0 || cached.news_items?.length > 0);
        if (age < 6 * 60 * 60 * 1000 && cached.h2h_summary && hasStructured) {
          console.log("Returning cached match context (with structured data)");
          return new Response(JSON.stringify({ context: cached.h2h_summary }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // ── Step 1: Fetch structured data from API-Football ──
    let structuredContext = "";
    let apiInjuriesHome: any[] = [];
    let apiInjuriesAway: any[] = [];
    let apiLineupsHome: any[] = [];
    let apiLineupsAway: any[] = [];

    if (apiKey) {
      const fetches: Promise<any[]>[] = [];
      const labels: string[] = [];

      if (api_football_id) {
        fetches.push(apiFootballFetch(`/injuries?fixture=${api_football_id}`, apiKey));
        labels.push("injuries");
        fetches.push(apiFootballFetch(`/fixtures/lineups?fixture=${api_football_id}`, apiKey));
        labels.push("lineups");
        fetches.push(apiFootballFetch(`/predictions?fixture=${api_football_id}`, apiKey));
        labels.push("predictions");
      } else {
        const leagueId = LEAGUE_IDS[league];
        const now = new Date();
        const season = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
        if (leagueId) {
          fetches.push(apiFootballFetch(`/injuries?league=${leagueId}&season=${season}`, apiKey));
          labels.push("injuries");
        }
      }

      const results = await Promise.all(fetches);
      const parts: string[] = [];

      for (let i = 0; i < results.length; i++) {
        const data = results[i];
        const label = labels[i];
        if (label === "injuries") {
          let filtered = data;
          if (!api_football_id && (home_team_api_id || away_team_api_id)) {
            filtered = data.filter((d: any) =>
              d.team?.id === home_team_api_id || d.team?.id === away_team_api_id
            );
          }
          const s = formatInjuries(filtered);
          if (s) parts.push(s);
          // Extract structured injuries
          const extracted = extractInjuries(filtered, home_team_api_id);
          apiInjuriesHome = extracted.home;
          apiInjuriesAway = extracted.away;
        } else if (label === "lineups") {
          const s = formatLineups(data);
          if (s) parts.push(s);
          const extracted = extractLineups(data);
          apiLineupsHome = extracted.home;
          apiLineupsAway = extracted.away;
        } else if (label === "predictions") {
          const s = formatPredictions(data);
          if (s) parts.push(s);
        }
      }

      if (parts.length > 0) {
        structuredContext = parts.join("\n\n");
      }
    }

    // ── Step 2: Firecrawl live web scraping ──
    let firecrawlContext = "";
    if (firecrawlKey) {
      firecrawlContext = await scrapeFirecrawlContext(home_team, away_team, league, firecrawlKey);
    }

    // ── Step 3: AI synthesis of all data ──
    const prompt = `You are a football research assistant. Analyze the following data about this upcoming match and synthesize a comprehensive match preview:

${home_team} vs ${away_team}
League: ${league || "Unknown"}
Date: ${match_date || "Upcoming"}

${structuredContext ? `VERIFIED API DATA:\n${structuredContext}\n\n` : ""}${firecrawlContext ? `${firecrawlContext}\n\n` : ""}${!structuredContext && !firecrawlContext ? "No pre-fetched data available. Use your knowledge to provide context.\n\n" : ""}Based on ALL the data above, provide a structured summary covering:

1. INJURED PLAYERS: Who is currently injured for each team? Expected return dates if known.
2. SUSPENDED PLAYERS: Who is suspended for this match?
3. EXPECTED LINEUPS: What is the predicted starting XI for each team?
4. RECENT FORM & MORALE: How has each team been performing recently?
5. TEAM NEWS: Any manager changes, transfers, tactical shifts?
6. HEAD-TO-HEAD: Recent head-to-head record
7. WEATHER: Expected weather conditions if known
8. KEY STATS: Goals scored/conceded, clean sheets, home/away record

Be specific with player names. If the scraped data contains lineup or injury info, use that as the primary source. If information is missing, say so explicitly.

Format as plain text paragraphs, not markdown.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2500,
        temperature: 0.3,
      }),
    });

    let webContext = "";
    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      webContext = aiData.choices?.[0]?.message?.content || "";
    } else {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again later.", context: structuredContext }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted.", context: structuredContext }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error(`AI API error: ${status}`);
    }

    const combinedContext = [structuredContext, firecrawlContext, webContext].filter(Boolean).join("\n\n---\n\n");

    // ── Step 4: Extract structured fields from all context using AI tool calling ──
    const allContextForExtraction = [structuredContext, firecrawlContext, webContext].filter(Boolean).join("\n\n");
    const structuredFields = await extractStructuredContext(allContextForExtraction, home_team, away_team, lovableApiKey);

    // Merge API-Football structured data with AI-extracted data (API data takes priority)
    if (apiInjuriesHome.length > 0) structuredFields.injuries_home = apiInjuriesHome;
    if (apiInjuriesAway.length > 0) structuredFields.injuries_away = apiInjuriesAway;
    if (apiLineupsHome.length > 0) structuredFields.lineup_home = apiLineupsHome;
    if (apiLineupsAway.length > 0) structuredFields.lineup_away = apiLineupsAway;

    // Cache the result with structured fields
    if (supabase) {
      await cacheContext(supabase, match_id, combinedContext, structuredFields);
    }

    return new Response(JSON.stringify({ context: combinedContext }), {
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
