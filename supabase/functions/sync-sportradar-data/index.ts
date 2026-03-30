import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "https://api.sportradar.com/soccer/trial/v4/en";

// Centralized season config (mirrors src/lib/seasons.ts for edge function)
const LEAGUE_SEASONS: Record<string, { seasonId: string; league: string; country: string }> = {
  "sr:competition:17": { seasonId: "sr:season:118689", league: "Premier League", country: "England" },
  "sr:competition:8": { seasonId: "sr:season:118691", league: "La Liga", country: "Spain" },
  "sr:competition:23": { seasonId: "sr:season:118699", league: "Serie A", country: "Italy" },
};

// Team name aliases for fuzzy matching
const TEAM_NAME_ALIASES: Record<string, string> = {
  "internazionale": "inter milan",
  "inter milano": "inter milan",
  "fc internazionale milano": "inter milan",
  "atletico de madrid": "atletico madrid",
  "atlético de madrid": "atletico madrid",
  "atlético madrid": "atletico madrid",
  "club atlético de madrid": "atletico madrid",
  "wolverhampton wanderers": "wolves",
  "wolverhampton": "wolves",
  "tottenham hotspur": "tottenham",
  "west ham united": "west ham",
  "manchester city fc": "manchester city",
  "manchester united fc": "manchester united",
  "arsenal fc": "arsenal",
  "chelsea fc": "chelsea",
  "liverpool fc": "liverpool",
  "newcastle united fc": "newcastle",
  "newcastle united": "newcastle",
  "brighton and hove albion": "brighton",
  "brighton & hove albion": "brighton",
  "real madrid cf": "real madrid",
  "fc barcelona": "barcelona",
  "juventus fc": "juventus",
  "ac milan": "milan",
  "ssc napoli": "napoli",
  "as roma": "roma",
  "ss lazio": "lazio",
  "acf fiorentina": "fiorentina",
  "atalanta bc": "atalanta",
  "torino fc": "torino",
  "bologna fc 1909": "bologna",
  "bologna fc": "bologna",
  "athletic club": "athletic bilbao",
  "athletic de bilbao": "athletic bilbao",
  "sevilla fc": "sevilla",
  "villarreal cf": "villarreal",
  "real betis balompié": "real betis",
  "celta de vigo": "celta vigo",
  "rc celta de vigo": "celta vigo",
  "valencia cf": "valencia",
  "ca osasuna": "osasuna",
  "rcd mallorca": "mallorca",
  "rcd espanyol": "espanyol",
  "getafe cf": "getafe",
  "deportivo alavés": "alaves",
  "deportivo alaves": "alaves",
  "girona fc": "girona",
  "genoa cfc": "genoa",
  "udinese calcio": "udinese",
  "empoli fc": "empoli",
  "hellas verona fc": "verona",
  "hellas verona": "verona",
  "us lecce": "lecce",
  "cagliari calcio": "cagliari",
  "parma calcio 1913": "parma",
  "como 1907": "como",
  "venezia fc": "venezia",
  "ac monza": "monza",
};

function resolveTeamName(name: string): string {
  const lower = name.toLowerCase().trim();
  return TEAM_NAME_ALIASES[lower] ?? lower;
}

async function srFetch(path: string, apiKey: string) {
  const url = `${BASE_URL}${path}?api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    console.error(`SR API error ${res.status} for ${path}: ${text}`);
    return null;
  }
  return res.json();
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("SPORTRADAR_API_KEY");
    if (!apiKey) throw new Error("SPORTRADAR_API_KEY not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const summary = { teamsMatched: 0, matchesMatched: 0, probabilitiesSynced: 0, errors: [] as string[] };

    const { data: existingTeams } = await supabase.from("teams").select("id, name, sportradar_id");
    const teamsByName = new Map<string, any>();
    existingTeams?.forEach((t) => {
      teamsByName.set(t.name.toLowerCase(), t);
    });

    for (const [_compId, config] of Object.entries(LEAGUE_SEASONS)) {
      console.log(`Syncing ${config.league} (${config.seasonId})...`);

      const schedData = await srFetch(`/seasons/${config.seasonId}/schedules.json`, apiKey);
      await delay(1200);

      if (!schedData?.schedules) {
        summary.errors.push(`No schedules for ${config.league}`);
        continue;
      }

      for (const sched of schedData.schedules) {
        const event = sched.sport_event;
        if (!event?.competitors || event.competitors.length < 2) continue;

        const homeComp = event.competitors.find((c: any) => c.qualifier === "home");
        const awayComp = event.competitors.find((c: any) => c.qualifier === "away");
        if (!homeComp || !awayComp) continue;

        // Use alias-resolved names for matching
        const homeResolved = resolveTeamName(homeComp.name);
        const awayResolved = resolveTeamName(awayComp.name);
        const homeTeam = teamsByName.get(homeResolved) ?? teamsByName.get(homeComp.name.toLowerCase());
        const awayTeam = teamsByName.get(awayResolved) ?? teamsByName.get(awayComp.name.toLowerCase());

        if (homeTeam && !homeTeam.sportradar_id) {
          await supabase.from("teams").update({ sportradar_id: homeComp.id }).eq("id", homeTeam.id);
          homeTeam.sportradar_id = homeComp.id;
          summary.teamsMatched++;
        }
        if (awayTeam && !awayTeam.sportradar_id) {
          await supabase.from("teams").update({ sportradar_id: awayComp.id }).eq("id", awayTeam.id);
          awayTeam.sportradar_id = awayComp.id;
          summary.teamsMatched++;
        }

        if (homeTeam && awayTeam) {
          const eventDate = event.start_time?.substring(0, 10);
          if (eventDate) {
            const { data: matchRows } = await supabase
              .from("matches")
              .select("id, sportradar_id")
              .eq("team_home_id", homeTeam.id)
              .eq("team_away_id", awayTeam.id)
              .gte("match_date", eventDate + "T00:00:00")
              .lte("match_date", eventDate + "T23:59:59")
              .limit(1);

            if (matchRows && matchRows.length > 0 && !matchRows[0].sportradar_id) {
              await supabase.from("matches").update({ sportradar_id: event.id }).eq("id", matchRows[0].id);
              summary.matchesMatched++;
            }
          }
        }
      }

      // Fetch probabilities
      const probData = await srFetch(`/seasons/${config.seasonId}/probabilities.json`, apiKey);
      await delay(1200);

      if (probData?.sport_event_probabilities) {
        for (const prob of probData.sport_event_probabilities) {
          const eventId = prob.sport_event?.id;
          if (!eventId) continue;

          const { data: matchRows } = await supabase
            .from("matches")
            .select("id")
            .eq("sportradar_id", eventId)
            .limit(1);

          if (!matchRows || matchRows.length === 0) continue;

          const markets = prob.markets;
          if (!markets) continue;

          const threeWay = markets.find((m: any) => m.name === "3way");
          if (!threeWay?.outcomes) continue;

          const homeWin = threeWay.outcomes.find((o: any) => o.name === "home_team_winner")?.probability || 0;
          const draw = threeWay.outcomes.find((o: any) => o.name === "draw")?.probability || 0;
          const awayWin = threeWay.outcomes.find((o: any) => o.name === "away_team_winner")?.probability || 0;

          const ouMarket = markets.find((m: any) => m.name === "total" && m.specifier === "2.5");
          let overUnder = "under";
          if (ouMarket?.outcomes) {
            const overProb = ouMarket.outcomes.find((o: any) => o.name === "over")?.probability || 0;
            overUnder = overProb > 0.5 ? "over" : "under";
          }

          // Check if existing prediction has real xG values — don't overwrite with zeros
          const { data: existingPred } = await supabase
            .from("predictions")
            .select("expected_goals_home, expected_goals_away")
            .eq("match_id", matchRows[0].id)
            .limit(1);

          const hasRealXg = existingPred && existingPred.length > 0 &&
            (Number(existingPred[0].expected_goals_home) > 0 || Number(existingPred[0].expected_goals_away) > 0);

          const upsertData: any = {
            match_id: matchRows[0].id,
            home_win: homeWin,
            draw: draw,
            away_win: awayWin,
            over_under_25: overUnder,
            model_confidence: Math.max(homeWin, draw, awayWin),
          };

          // Only set xG if no real values exist
          if (!hasRealXg) {
            upsertData.expected_goals_home = 0;
            upsertData.expected_goals_away = 0;
          }

          const { error } = await supabase.from("predictions").upsert(
            upsertData,
            { onConflict: "match_id" }
          );

          if (error) {
            summary.errors.push(`Prediction upsert error: ${error.message}`);
          } else {
            summary.probabilitiesSynced++;
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sync-sportradar error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
