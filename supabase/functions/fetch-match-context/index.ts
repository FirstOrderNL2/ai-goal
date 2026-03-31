const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://v3.football.api-sports.io";

// League name → API-Football league ID mapping
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { home_team, away_team, league, match_date, api_football_id, home_team_api_id, away_team_api_id } = await req.json();
    if (!home_team || !away_team) {
      return new Response(JSON.stringify({ error: "home_team and away_team required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("API_FOOTBALL_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not set");

    // ── Step 1: Fetch structured data from API-Football ──
    let structuredContext = "";

    if (apiKey) {
      const fetches: Promise<any[]>[] = [];
      const labels: string[] = [];

      if (api_football_id) {
        // Fixture-specific data
        fetches.push(apiFootballFetch(`/injuries?fixture=${api_football_id}`, apiKey));
        labels.push("injuries");
        fetches.push(apiFootballFetch(`/fixtures/lineups?fixture=${api_football_id}`, apiKey));
        labels.push("lineups");
        fetches.push(apiFootballFetch(`/predictions?fixture=${api_football_id}`, apiKey));
        labels.push("predictions");
      } else {
        // Fallback: league-level injuries
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
          // Filter to relevant teams if league-level
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

    // ── Step 2: AI web search for supplementary context ──
    const prompt = `You are a football research assistant. Search the web for the latest information about this upcoming match:

${home_team} vs ${away_team}
League: ${league || "Unknown"}
Date: ${match_date || "Upcoming"}

${structuredContext ? `I already have the following VERIFIED data from API sources. Do NOT repeat this — instead focus on information NOT covered below:\n\n${structuredContext}\n\n` : ""}Find and report the following for BOTH teams:

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

    // Combine structured + web context
    const combinedContext = [structuredContext, webContext].filter(Boolean).join("\n\n---\n\n");

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
