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
    return `${team} (${formation}): ${starters}`;
  });
  return `CONFIRMED LINEUPS:\n${parts.join("\n")}`;
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
    // Truncate to avoid blowing up the prompt
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

  // Search for match-specific injury/lineup news
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
          tbs: "qdr:w", // last week
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

  // Also try scraping iservoetbalvanavond.nl for today's matches
  try {
    const todayPage = await scrapeWithFirecrawl("https://www.iservoetbalvanavond.nl", firecrawlKey);
    if (todayPage && (todayPage.toLowerCase().includes(homeName.toLowerCase()) || todayPage.toLowerCase().includes(awayName.toLowerCase()))) {
      parts.push(`[SOURCE: iservoetbalvanavond.nl]\n${todayPage}`);
    }
  } catch (_) {
    // Non-critical
  }

  return parts.length > 0 ? `LIVE WEB SCRAPED DATA:\n\n${parts.join("\n\n")}` : "";
}

// ── Cache context to match_context table ──
async function cacheContext(
  supabase: any, matchId: string | undefined, contextText: string
) {
  if (!matchId) return;
  try {
    await supabase.from("match_context").upsert({
      match_id: matchId,
      h2h_summary: contextText.slice(0, 10000),
      scraped_at: new Date().toISOString(),
    }, { onConflict: "match_id" });
  } catch (_) {
    // Non-critical
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
        if (age < 6 * 60 * 60 * 1000 && cached.h2h_summary) {
          console.log("Returning cached match context");
          return new Response(JSON.stringify({ context: cached.h2h_summary }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // ── Step 1: Fetch structured data from API-Football ──
    let structuredContext = "";

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
        } else if (label === "lineups") {
          const s = formatLineups(data);
          if (s) parts.push(s);
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

    // Cache the result
    if (supabase) {
      await cacheContext(supabase, match_id, combinedContext);
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
