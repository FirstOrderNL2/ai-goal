import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://v3.football.api-sports.io";

const LEAGUES = [
  // Domestic leagues
  { id: 39, name: "Premier League", country: "England", type: "league" },
  { id: 40, name: "Championship", country: "England", type: "league" },
  { id: 140, name: "La Liga", country: "Spain", type: "league" },
  { id: 135, name: "Serie A", country: "Italy", type: "league" },
  { id: 78, name: "Bundesliga", country: "Germany", type: "league" },
  { id: 61, name: "Ligue 1", country: "France", type: "league" },
  { id: 88, name: "Eredivisie", country: "Netherlands", type: "league" },
  { id: 89, name: "Keuken Kampioen Divisie", country: "Netherlands", type: "league" },
  // European cups
  { id: 2, name: "Champions League", country: "World", type: "cup" },
  { id: 3, name: "Europa League", country: "World", type: "cup" },
  { id: 848, name: "Conference League", country: "World", type: "cup" },
  { id: 748, name: "Women's Champions League", country: "World", type: "cup" },
  // International
  { id: 1, name: "World Cup", country: "World", type: "cup" },
  { id: 32, name: "WC Qualifiers Europe", country: "World", type: "cup" },
  { id: 34, name: "WC Qualifiers South America", country: "World", type: "cup" },
  { id: 33, name: "WC Qualifiers CONCACAF", country: "World", type: "cup" },
  { id: 5, name: "Nations League", country: "World", type: "cup" },
  { id: 4, name: "Euro Championship", country: "World", type: "cup" },
  { id: 9, name: "Copa America", country: "World", type: "cup" },
  { id: 10, name: "Friendlies", country: "World", type: "cup" },
];

const now = new Date();
const SEASON = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;

const TEAM_NAME_ALIASES: Record<string, string> = {
  "internazionale": "inter milan", "inter milano": "inter milan", "fc internazionale milano": "inter milan",
  "atletico de madrid": "atletico madrid", "atlético de madrid": "atletico madrid", "atlético madrid": "atletico madrid",
  "wolverhampton wanderers": "wolves", "tottenham hotspur": "tottenham", "west ham united": "west ham",
  "manchester city fc": "manchester city", "manchester united fc": "manchester united",
  "arsenal fc": "arsenal", "chelsea fc": "chelsea", "liverpool fc": "liverpool",
  "newcastle united fc": "newcastle", "newcastle united": "newcastle",
  "brighton and hove albion": "brighton", "brighton & hove albion": "brighton",
  "aston villa fc": "aston villa", "nottingham forest fc": "nottingham forest",
  "leicester city fc": "leicester", "leicester city": "leicester",
  "crystal palace fc": "crystal palace",
  "everton fc": "everton", "fulham fc": "fulham",
  "bournemouth": "afc bournemouth", "ipswich town fc": "ipswich", "ipswich town": "ipswich",
  "southampton fc": "southampton", "brentford fc": "brentford",
  // Championship aliases
  "coventry city": "coventry", "derby county": "derby", "preston north end": "preston",
  "hull city": "hull city", "middlesbrough fc": "middlesbrough",
  "millwall fc": "millwall", "oxford united": "oxford united",
  "norwich city": "norwich", "portsmouth fc": "portsmouth",
  "birmingham city": "birmingham", "blackburn rovers": "blackburn",
  "bristol city fc": "bristol city", "stoke city fc": "stoke city",
  "swansea city": "swansea", "west bromwich albion": "west brom", "west bromwich": "west brom",
  "queens park rangers": "qpr", "sheffield united": "sheffield utd",
  "wrexham afc": "wrexham", "watford fc": "watford",
  "charlton athletic": "charlton", "sheffield wednesday fc": "sheffield wednesday",
  // Spain
  "real madrid cf": "real madrid", "fc barcelona": "barcelona", "rcd espanyol": "espanyol",
  "real sociedad de fútbol": "real sociedad", "real betis balompié": "real betis",
  "villarreal cf": "villarreal", "sevilla fc": "sevilla", "valencia cf": "valencia",
  "ca osasuna": "osasuna", "rcd mallorca": "mallorca",
  "celta de vigo": "celta vigo", "rc celta de vigo": "celta vigo",
  "getafe cf": "getafe", "deportivo alavés": "alaves", "deportivo alaves": "alaves",
  "girona fc": "girona", "athletic club": "athletic bilbao",
  "juventus fc": "juventus", "ac milan": "milan", "ssc napoli": "napoli",
  "as roma": "roma", "ss lazio": "lazio", "acf fiorentina": "fiorentina",
  "atalanta bc": "atalanta", "torino fc": "torino",
  "bologna fc 1909": "bologna", "bologna fc": "bologna",
  "genoa cfc": "genoa", "udinese calcio": "udinese", "empoli fc": "empoli",
  "hellas verona fc": "verona", "hellas verona": "verona",
  "us lecce": "lecce", "cagliari calcio": "cagliari", "parma calcio 1913": "parma",
  "como 1907": "como", "venezia fc": "venezia", "ac monza": "monza",
  "fc bayern münchen": "bayern munich", "fc bayern munich": "bayern munich", "bayern münchen": "bayern munich",
  "borussia dortmund": "dortmund", "bayer 04 leverkusen": "bayer leverkusen",
  "rb leipzig": "leipzig", "vfb stuttgart": "stuttgart",
  "eintracht frankfurt": "frankfurt", "sg eintracht frankfurt": "frankfurt",
  "borussia mönchengladbach": "monchengladbach", "borussia monchengladbach": "monchengladbach",
  "vfl wolfsburg": "wolfsburg", "sc freiburg": "freiburg",
  "1. fc union berlin": "union berlin", "tsg 1899 hoffenheim": "hoffenheim",
  "1. fsv mainz 05": "mainz", "fc augsburg": "augsburg",
  "1. fc heidenheim 1846": "heidenheim", "fc heidenheim": "heidenheim",
  "sv werder bremen": "werder bremen", "vfl bochum 1848": "bochum", "vfl bochum": "bochum",
  "fc st. pauli": "st. pauli", "holstein kiel": "kiel",
  "paris saint-germain": "psg", "paris saint-germain fc": "psg",
  "olympique de marseille": "marseille", "as monaco": "monaco", "as monaco fc": "monaco",
  "olympique lyonnais": "lyon", "losc lille": "lille",
  "stade rennais fc": "rennes", "rc lens": "lens", "ogc nice": "nice",
  "rc strasbourg alsace": "strasbourg", "fc nantes": "nantes",
  "stade brestois 29": "brest", "toulouse fc": "toulouse",
  "montpellier hsc": "montpellier", "le havre ac": "le havre",
  "stade de reims": "reims", "as saint-étienne": "saint-etienne",
  "angers sco": "angers", "aj auxerre": "auxerre",
  "us sassuolo calcio": "sassuolo", "sassuolo calcio": "sassuolo",
};

function resolveTeamName(name: string): string {
  const lower = name.toLowerCase().trim();
  return TEAM_NAME_ALIASES[lower] ?? lower;
}

// Completed match statuses
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);
const LIVE_STATUSES = new Set(["1H", "2H", "HT", "ET", "BT", "P"]);
const CANCELLED_STATUSES = new Set(["PST", "CANC", "ABD", "AWD", "WO"]);

function mapStatus(apiStatus: string): string {
  if (FINISHED_STATUSES.has(apiStatus)) return "completed";
  if (LIVE_STATUSES.has(apiStatus)) return "live";
  if (CANCELLED_STATUSES.has(apiStatus)) return "cancelled";
  return "upcoming"; // NS, TBD, etc.
}

// Rate limit tracker
let apiCallCount = 0;
const API_CALL_LIMIT = 400; // Raised for expanded league coverage

async function apiFetch(path: string, apiKey: string) {
  if (apiCallCount >= API_CALL_LIMIT) {
    console.warn(`Rate limit reached (${apiCallCount} calls), skipping: ${path}`);
    return [];
  }
  const url = `${API_BASE}${path}`;
  console.log(`[${++apiCallCount}] Fetching: ${url}`);
  const res = await fetch(url, {
    headers: { "x-apisports-key": apiKey },
  });
  if (!res.ok) throw new Error(`API-Football error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    console.error("API errors:", JSON.stringify(json.errors));
  }
  // Rate limit info from headers
  const remaining = res.headers.get("x-ratelimit-requests-remaining");
  if (remaining) console.log(`API calls remaining today: ${remaining}`);
  console.log(`Results for ${path}: ${json.results}`);
  return json.response ?? [];
}

async function delay(ms: number) {
  await new Promise(r => setTimeout(r, ms));
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

    // Reset call counter per request
    apiCallCount = 0;

    const summary = { teams: 0, matches: 0, predictions: 0, odds: 0, logosUpdated: 0, standings: 0, teamStats: 0, h2h: 0, lineups: 0, players: 0 };

    // Load ALL existing teams from DB for cross-matching
    const { data: existingTeams } = await supabase.from("teams").select("id, name, api_football_id, logo_url, sportradar_id");
    const teamsByResolvedName = new Map<string, any>();
    const teamsByApiId = new Map<number, any>();
    existingTeams?.forEach((t) => {
      teamsByResolvedName.set(resolveTeamName(t.name), t);
      if (t.api_football_id) teamsByApiId.set(t.api_football_id, t);
    });

    const seasonStart = `${SEASON}-08-01`;
    const seasonEnd = `${SEASON + 1}-07-31`;
    const today = new Date().toISOString().slice(0, 10);
    const dateRanges = [
      { from: seasonStart, to: today, type: "completed" },
      { from: today, to: seasonEnd, type: "upcoming" },
    ];

    for (const league of LEAGUES) {
      if (apiCallCount >= API_CALL_LIMIT) break;

      // ── 1. Fetch fixtures ──
      const allFixtures: any[] = [];
      for (const range of dateRanges) {
        try {
          const fixtures = await apiFetch(
            `/fixtures?league=${league.id}&season=${SEASON}&from=${range.from}&to=${range.to}`,
            apiKey
          );
          for (const f of fixtures) f._rangeType = range.type;
          allFixtures.push(...fixtures);
          await delay(300);
        } catch (e) {
          console.error(`Error fetching ${league.name} ${range.type}:`, e);
        }
      }

      if (allFixtures.length === 0) continue;

      // ── 2. Process teams ──
      const teamsToUpsert = new Map<number, any>();
      const teamsToUpdateLogo: { id: string; api_football_id: number; logo_url: string }[] = [];

      for (const f of allFixtures) {
        for (const side of ["home", "away"] as const) {
          const t = f.teams[side];
          if (teamsToUpsert.has(t.id) || teamsByApiId.has(t.id)) continue;
          const resolved = resolveTeamName(t.name);
          const existingByName = teamsByResolvedName.get(resolved);
          if (existingByName) {
            if (!existingByName.api_football_id || !existingByName.logo_url) {
              teamsToUpdateLogo.push({ id: existingByName.id, api_football_id: t.id, logo_url: t.logo });
              existingByName.api_football_id = t.id;
              existingByName.logo_url = t.logo;
              teamsByApiId.set(t.id, existingByName);
            }
          } else {
            teamsToUpsert.set(t.id, {
              api_football_id: t.id, name: t.name, logo_url: t.logo,
              league: league.name, country: league.country,
            });
          }
        }
      }

      for (const upd of teamsToUpdateLogo) {
        const { error } = await supabase.from("teams")
          .update({ api_football_id: upd.api_football_id, logo_url: upd.logo_url })
          .eq("id", upd.id);
        if (!error) summary.logosUpdated++;
      }

      if (teamsToUpsert.size > 0) {
        const { error: te } = await supabase.from("teams")
          .upsert(Array.from(teamsToUpsert.values()), { onConflict: "api_football_id", ignoreDuplicates: false });
        if (te) console.error("teams upsert error:", te);
        else summary.teams += teamsToUpsert.size;
      }

      // Refresh team uuid mapping
      const apiIds = [...Array.from(teamsToUpsert.keys()), ...teamsToUpdateLogo.map(u => u.api_football_id)];
      const { data: dbTeams } = await supabase.from("teams").select("id, api_football_id").in("api_football_id", apiIds);
      const teamUuidMap = new Map<number, string>();
      for (const t of dbTeams ?? []) teamUuidMap.set(t.api_football_id!, t.id);
      teamsByApiId.forEach((t, apiId) => { if (!teamUuidMap.has(apiId)) teamUuidMap.set(apiId, t.id); });

      // ── 3. Upsert matches with proper status mapping ──
      const matchRows = allFixtures.map((f: any) => {
        const status = mapStatus(f.fixture.status.short);
        const isFinished = status === "completed";
        return {
          api_football_id: f.fixture.id,
          match_date: f.fixture.date,
          team_home_id: teamUuidMap.get(f.teams.home.id),
          team_away_id: teamUuidMap.get(f.teams.away.id),
          goals_home: isFinished ? f.goals.home : null,
          goals_away: isFinished ? f.goals.away : null,
          status: status === "live" ? "upcoming" : status, // treat live as upcoming for DB
          league: league.name,
          round: f.league.round ?? null,
        };
      }).filter((m: any) => m.team_home_id && m.team_away_id);

      if (matchRows.length > 0) {
        const { error: me } = await supabase.from("matches")
          .upsert(matchRows, { onConflict: "api_football_id", ignoreDuplicates: false });
        if (me) console.error("matches upsert error:", me);
        else summary.matches += matchRows.length;
      }

      // Get match uuid mapping
      const fixtureIds = allFixtures.map((f: any) => f.fixture.id);
      const { data: dbMatches } = await supabase.from("matches")
        .select("id, api_football_id").in("api_football_id", fixtureIds);
      const matchUuidMap = new Map<number, string>();
      for (const m of dbMatches ?? []) matchUuidMap.set(m.api_football_id!, m.id);

      // ── 4. Fetch standings ──
      if (apiCallCount < API_CALL_LIMIT) {
        try {
          const standingsData = await apiFetch(`/standings?league=${league.id}&season=${SEASON}`, apiKey);
          await delay(300);
          if (standingsData.length > 0) {
            const leagueData = standingsData[0]?.league;
            if (leagueData) {
              const { error } = await supabase.from("leagues").upsert({
                api_football_id: league.id,
                name: league.name,
                country: league.country,
                season: SEASON,
                logo_url: leagueData.logo ?? null,
                standings_data: leagueData.standings ?? [],
                type: league.type,
                updated_at: new Date().toISOString(),
              }, { onConflict: "api_football_id" });
              if (error) console.error("leagues upsert error:", error);
              else summary.standings++;
            }
          }
        } catch (e) {
          console.error(`Standings error for ${league.name}:`, e);
        }
      }

      // ── 5. Fetch team statistics (top 5 teams per league to save API calls) ──
      // Get league UUID for FK
      const { data: leagueRow } = await supabase.from("leagues")
        .select("id").eq("api_football_id", league.id).single();

      if (leagueRow && apiCallCount < API_CALL_LIMIT) {
        // Get unique team API IDs from this league's fixtures (limit to save calls)
        const teamApiIds = [...new Set(allFixtures.flatMap((f: any) => [f.teams.home.id, f.teams.away.id]))].slice(0, 10);

        for (const teamApiId of teamApiIds) {
          if (apiCallCount >= API_CALL_LIMIT) break;
          try {
            const stats = await apiFetch(`/teams/statistics?team=${teamApiId}&league=${league.id}&season=${SEASON}`, apiKey);
            await delay(300);
            if (stats && stats.fixtures) {
              const teamUuid = teamUuidMap.get(teamApiId);
              if (!teamUuid) continue;

              const played = (stats.fixtures.played?.total ?? 0);
              const goalsFor = (stats.goals?.for?.total?.total ?? 0);
              const goalsAgainst = (stats.goals?.against?.total?.total ?? 0);

              const { error } = await supabase.from("team_statistics").upsert({
                team_id: teamUuid,
                league_id: leagueRow.id,
                season: SEASON,
                matches_played: played,
                wins: stats.fixtures.wins?.total ?? 0,
                draws: stats.fixtures.draws?.total ?? 0,
                losses: stats.fixtures.loses?.total ?? 0,
                goals_for: goalsFor,
                goals_against: goalsAgainst,
                goal_diff: goalsFor - goalsAgainst,
                form: stats.form ?? null,
                home_record: {
                  played: stats.fixtures.played?.home ?? 0,
                  wins: stats.fixtures.wins?.home ?? 0,
                  draws: stats.fixtures.draws?.home ?? 0,
                  losses: stats.fixtures.loses?.home ?? 0,
                  goals_for: stats.goals?.for?.total?.home ?? 0,
                  goals_against: stats.goals?.against?.total?.home ?? 0,
                },
                away_record: {
                  played: stats.fixtures.played?.away ?? 0,
                  wins: stats.fixtures.wins?.away ?? 0,
                  draws: stats.fixtures.draws?.away ?? 0,
                  losses: stats.fixtures.loses?.away ?? 0,
                  goals_for: stats.goals?.for?.total?.away ?? 0,
                  goals_against: stats.goals?.against?.total?.away ?? 0,
                },
                clean_sheets: stats.clean_sheet?.total ?? 0,
                failed_to_score: stats.failed_to_score?.total ?? 0,
                avg_goals_scored: played > 0 ? Math.round((goalsFor / played) * 100) / 100 : 0,
                avg_goals_conceded: played > 0 ? Math.round((goalsAgainst / played) * 100) / 100 : 0,
                updated_at: new Date().toISOString(),
              }, { onConflict: "team_id,league_id,season" });
              if (error) console.error("team_statistics upsert error:", error);
              else summary.teamStats++;
            }
          } catch (e) {
            console.error(`Team stats error for ${teamApiId}:`, e);
          }
        }
      }

      // ── 6. Fetch predictions for upcoming matches (5 per league) ──
      const upcomingFixtures = allFixtures.filter((f: any) => mapStatus(f.fixture.status.short) === "upcoming").slice(0, 5);
      for (const f of upcomingFixtures) {
        if (apiCallCount >= API_CALL_LIMIT) break;
        try {
          const preds = await apiFetch(`/predictions?fixture=${f.fixture.id}`, apiKey);
          await delay(300);
          if (preds.length > 0) {
            const p = preds[0];
            const matchId = matchUuidMap.get(f.fixture.id);
            if (matchId) {
              const homeWin = parseFloat(p.predictions.percent.home?.replace("%", "") ?? "0") / 100;
              const draw = parseFloat(p.predictions.percent.draw?.replace("%", "") ?? "0") / 100;
              const awayWin = parseFloat(p.predictions.percent.away?.replace("%", "") ?? "0") / 100;
              const homeGoalAvg = parseFloat(p.teams?.home?.league?.goals?.for?.average?.total ?? "1.3");
              const awayGoalAvg = parseFloat(p.teams?.away?.league?.goals?.for?.average?.total ?? "1.1");
              const totalXg = homeGoalAvg + awayGoalAvg;

              const { error: pe } = await supabase.from("predictions").upsert({
                match_id: matchId,
                home_win: homeWin, draw, away_win: awayWin,
                expected_goals_home: homeGoalAvg, expected_goals_away: awayGoalAvg,
                over_under_25: totalXg > 2.5 ? "over" : "under",
                model_confidence: Math.max(homeWin, draw, awayWin),
              }, { onConflict: "match_id" });
              if (pe) console.error("prediction upsert error:", pe);
              else summary.predictions++;
            }
          }
        } catch (e) {
          console.error(`prediction error for ${f.fixture.id}:`, e);
        }
      }

      // ── 7. Fetch H2H for upcoming matches ──
      const upcomingForH2H = allFixtures
        .filter((f: any) => mapStatus(f.fixture.status.short) === "upcoming")
        .slice(0, 3);

      for (const f of upcomingForH2H) {
        if (apiCallCount >= API_CALL_LIMIT) break;
        const matchId = matchUuidMap.get(f.fixture.id);
        if (!matchId) continue;
        try {
          const h2hData = await apiFetch(
            `/fixtures/headtohead?h2h=${f.teams.home.id}-${f.teams.away.id}&last=5`,
            apiKey
          );
          await delay(300);
          if (h2hData.length > 0) {
            const h2hResults = h2hData.map((h: any) => ({
              date: h.fixture.date,
              home: h.teams.home.name,
              away: h.teams.away.name,
              score_home: h.goals.home,
              score_away: h.goals.away,
            }));
            // Store H2H in match_features (create or update)
            await supabase.from("match_features").upsert({
              match_id: matchId,
              h2h_results: h2hResults,
              computed_at: new Date().toISOString(),
            }, { onConflict: "match_id" });
            summary.h2h++;
          }
        } catch (e) {
          console.error(`H2H error for fixture ${f.fixture.id}:`, e);
        }
      }

      // ── 8. Fetch lineups for matches starting within 2 hours ──
      const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const soonMatches = allFixtures.filter((f: any) => {
        const matchTime = new Date(f.fixture.date).toISOString();
        return matchTime <= twoHoursFromNow && matchTime >= new Date().toISOString() && mapStatus(f.fixture.status.short) === "upcoming";
      }).slice(0, 3);

      for (const f of soonMatches) {
        if (apiCallCount >= API_CALL_LIMIT) break;
        const matchId = matchUuidMap.get(f.fixture.id);
        if (!matchId) continue;
        try {
          const lineups = await apiFetch(`/fixtures/lineups?fixture=${f.fixture.id}`, apiKey);
          await delay(300);
          if (lineups.length >= 2) {
            await supabase.from("match_context").upsert({
              match_id: matchId,
              lineup_home: lineups[0]?.startXI ?? [],
              lineup_away: lineups[1]?.startXI ?? [],
              scraped_at: new Date().toISOString(),
            }, { onConflict: "match_id" });
            summary.lineups++;
          }
        } catch (e) {
          console.error(`Lineups error for fixture ${f.fixture.id}:`, e);
        }
      }
      // ── 9. Fetch players for this league (first page = 20 players) ──
      if (apiCallCount < API_CALL_LIMIT && league.type === "league") {
        try {
          const playersData = await apiFetch(`/players?league=${league.id}&season=${SEASON}&page=1`, apiKey);
          await delay(300);
          for (const entry of playersData) {
            const p = entry.player;
            const stats = entry.statistics?.[0];
            const teamApiId = stats?.team?.id;
            const teamUuid = teamApiId ? (teamUuidMap.get(teamApiId) ?? teamsByApiId.get(teamApiId)?.id) : null;
            if (!p?.id) continue;
            const { error } = await supabase.from("players").upsert({
              api_football_id: p.id,
              name: p.name,
              position: stats?.games?.position ?? p.position ?? null,
              age: p.age ?? null,
              nationality: p.nationality ?? null,
              photo_url: p.photo ?? null,
              team_id: teamUuid ?? null,
              updated_at: new Date().toISOString(),
            }, { onConflict: "api_football_id" });
            if (!error) summary.players++;
          }
        } catch (e) {
          console.error(`Players error for ${league.name}:`, e);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, summary, apiCalls: apiCallCount }), {
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
