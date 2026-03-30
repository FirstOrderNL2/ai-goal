import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://v3.football.api-sports.io";
const LEAGUES = [
  { id: 39, name: "Premier League", country: "England" },
  { id: 140, name: "La Liga", country: "Spain" },
  { id: 135, name: "Serie A", country: "Italy" },
];
const SEASON = 2025;

async function apiFetch(path: string, apiKey: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "x-apisports-key": apiKey },
  });
  if (!res.ok) throw new Error(`API-Football error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.response ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("API_FOOTBALL_KEY");
    if (!apiKey) throw new Error("API_FOOTBALL_KEY not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const summary = { teams: 0, matches: 0, predictions: 0, odds: 0 };

    for (const league of LEAGUES) {
      // Fetch upcoming & completed fixtures
      const [upcoming, completed] = await Promise.all([
        apiFetch(`/fixtures?league=${league.id}&season=${SEASON}&next=15`, apiKey),
        apiFetch(`/fixtures?league=${league.id}&season=${SEASON}&last=20`, apiKey),
      ]);

      const allFixtures = [...upcoming, ...completed];

      // Upsert teams
      const teamsMap = new Map<number, any>();
      for (const f of allFixtures) {
        for (const side of ["home", "away"] as const) {
          const t = f.teams[side];
          if (!teamsMap.has(t.id)) {
            teamsMap.set(t.id, {
              api_football_id: t.id,
              name: t.name,
              logo_url: t.logo,
              league: league.name,
              country: league.country,
            });
          }
        }
      }

      if (teamsMap.size > 0) {
        const { error: te } = await supabase
          .from("teams")
          .upsert(
            Array.from(teamsMap.values()),
            { onConflict: "api_football_id", ignoreDuplicates: false }
          );
        if (te) console.error("teams upsert error:", te);
        else summary.teams += teamsMap.size;
      }

      // Get team uuid mapping
      const apiIds = Array.from(teamsMap.keys());
      const { data: dbTeams } = await supabase
        .from("teams")
        .select("id, api_football_id")
        .in("api_football_id", apiIds);
      const teamUuidMap = new Map<number, string>();
      for (const t of dbTeams ?? []) {
        teamUuidMap.set(t.api_football_id, t.id);
      }

      // Upsert matches
      const matchRows = allFixtures.map((f: any) => {
        const isFinished = f.fixture.status.short === "FT";
        return {
          api_football_id: f.fixture.id,
          match_date: f.fixture.date,
          team_home_id: teamUuidMap.get(f.teams.home.id),
          team_away_id: teamUuidMap.get(f.teams.away.id),
          goals_home: isFinished ? f.goals.home : null,
          goals_away: isFinished ? f.goals.away : null,
          status: isFinished ? "completed" : "upcoming",
          league: league.name,
          round: f.league.round ?? null,
        };
      }).filter((m: any) => m.team_home_id && m.team_away_id);

      if (matchRows.length > 0) {
        const { error: me } = await supabase
          .from("matches")
          .upsert(matchRows, { onConflict: "api_football_id", ignoreDuplicates: false });
        if (me) console.error("matches upsert error:", me);
        else summary.matches += matchRows.length;
      }

      // Get match uuid mapping
      const fixtureIds = allFixtures.map((f: any) => f.fixture.id);
      const { data: dbMatches } = await supabase
        .from("matches")
        .select("id, api_football_id")
        .in("api_football_id", fixtureIds);
      const matchUuidMap = new Map<number, string>();
      for (const m of dbMatches ?? []) {
        matchUuidMap.set(m.api_football_id, m.id);
      }

      // Fetch predictions for upcoming only (to save API calls)
      for (const f of upcoming.slice(0, 5)) {
        try {
          const preds = await apiFetch(`/predictions?fixture=${f.fixture.id}`, apiKey);
          if (preds.length > 0) {
            const p = preds[0];
            const matchId = matchUuidMap.get(f.fixture.id);
            if (matchId) {
              const homeWin = parseFloat(p.predictions.percent.home?.replace("%", "") ?? "0") / 100;
              const draw = parseFloat(p.predictions.percent.draw?.replace("%", "") ?? "0") / 100;
              const awayWin = parseFloat(p.predictions.percent.away?.replace("%", "") ?? "0") / 100;
              const xgHome = parseFloat(p.predictions.goals?.home ?? "1.2");
              const xgAway = parseFloat(p.predictions.goals?.away ?? "1.0");
              const totalXg = xgHome + xgAway;

              const { error: pe } = await supabase
                .from("predictions")
                .upsert(
                  {
                    match_id: matchId,
                    home_win: homeWin,
                    draw: draw,
                    away_win: awayWin,
                    expected_goals_home: xgHome,
                    expected_goals_away: xgAway,
                    over_under_25: totalXg > 2.5 ? "over" : "under",
                    model_confidence: Math.max(homeWin, draw, awayWin),
                  },
                  { onConflict: "match_id" }
                );
              if (pe) console.error("prediction upsert error:", pe);
              else summary.predictions++;
            }
          }
        } catch (e) {
          console.error(`prediction fetch error for fixture ${f.fixture.id}:`, e);
        }
      }

      // Fetch odds for upcoming (first 5 to save API calls)
      for (const f of upcoming.slice(0, 5)) {
        try {
          const oddsData = await apiFetch(`/odds?fixture=${f.fixture.id}`, apiKey);
          if (oddsData.length > 0) {
            const bookmaker = oddsData[0].bookmakers?.[0];
            const matchWinner = bookmaker?.bets?.find((b: any) => b.name === "Match Winner");
            if (matchWinner) {
              const matchId = matchUuidMap.get(f.fixture.id);
              if (matchId) {
                const homeOdds = parseFloat(matchWinner.values.find((v: any) => v.value === "Home")?.odd ?? "2.0");
                const drawOdds = parseFloat(matchWinner.values.find((v: any) => v.value === "Draw")?.odd ?? "3.0");
                const awayOdds = parseFloat(matchWinner.values.find((v: any) => v.value === "Away")?.odd ?? "3.5");

                const { error: oe } = await supabase
                  .from("odds")
                  .upsert(
                    {
                      match_id: matchId,
                      home_win_odds: homeOdds,
                      draw_odds: drawOdds,
                      away_win_odds: awayOdds,
                    },
                    { onConflict: "match_id" }
                  );
                if (oe) console.error("odds upsert error:", oe);
                else summary.odds++;
              }
            }
          }
        } catch (e) {
          console.error(`odds fetch error for fixture ${f.fixture.id}:`, e);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
