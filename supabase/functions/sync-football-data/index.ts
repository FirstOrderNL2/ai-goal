import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://v3.football.api-sports.io";

const LEAGUES = [
  { id: 39, name: "Premier League", country: "England", type: "league" },
  { id: 40, name: "Championship", country: "England", type: "league" },
  { id: 140, name: "La Liga", country: "Spain", type: "league" },
  { id: 135, name: "Serie A", country: "Italy", type: "league" },
  { id: 78, name: "Bundesliga", country: "Germany", type: "league" },
  { id: 61, name: "Ligue 1", country: "France", type: "league" },
  { id: 88, name: "Eredivisie", country: "Netherlands", type: "league" },
  { id: 89, name: "Keuken Kampioen Divisie", country: "Netherlands", type: "league" },
  { id: 2, name: "Champions League", country: "World", type: "cup" },
  { id: 3, name: "Europa League", country: "World", type: "cup" },
  { id: 848, name: "Conference League", country: "World", type: "cup" },
  { id: 748, name: "Women's Champions League", country: "World", type: "cup" },
  { id: 1, name: "World Cup", country: "World", type: "cup" },
  { id: 32, name: "WC Qualifiers Europe", country: "World", type: "cup" },
  { id: 34, name: "WC Qualifiers South America", country: "World", type: "cup" },
  { id: 33, name: "WC Qualifiers CONCACAF", country: "World", type: "cup" },
  { id: 5, name: "Nations League", country: "World", type: "cup" },
  { id: 4, name: "Euro Championship", country: "World", type: "cup" },
  { id: 9, name: "Copa America", country: "World", type: "cup" },
  { id: 10, name: "Friendlies", country: "World", type: "cup" },
];

const LEAGUE_IDS_STRING = LEAGUES.map(l => l.id).join("-");

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

function poissonPMF(lambda: number, k: number): number {
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) result *= lambda / i;
  return result;
}

function computeGoalLines(lambdaHome: number, lambdaAway: number): Record<string, number> {
  const thresholds = [0.5, 1.5, 2.5, 3.5, 4.5];
  const result: Record<string, number> = {};
  for (const t of thresholds) {
    let probUnder = 0;
    const maxGoals = Math.ceil(t) - 1;
    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        const p = poissonPMF(lambdaHome, h) * poissonPMF(lambdaAway, a);
        if (h + a <= maxGoals) probUnder += p;
      }
    }
    const key = t.toString().replace(".", "_");
    result[`over_${key}`] = Math.round((1 - probUnder) * 1000) / 1000;
    result[`under_${key}`] = Math.round(probUnder * 1000) / 1000;
  }
  return result;
}

function computeGoalDistribution(lambdaHome: number, lambdaAway: number): Record<string, number> {
  const dist: Record<string, number> = {};
  for (let total = 0; total <= 6; total++) {
    let prob = 0;
    for (let h = 0; h <= total; h++) {
      const a = total - h;
      if (a <= 8) prob += poissonPMF(lambdaHome, h) * poissonPMF(lambdaAway, a);
    }
    dist[`total_${total}`] = Math.round(prob * 1000) / 1000;
  }
  return dist;
}

function findBestPick(goalLines: Record<string, number>): string {
  const candidates = Object.entries(goalLines)
    .filter(([k, v]) => k.startsWith("over_") && v >= 0.55 && v <= 0.85)
    .sort((a, b) => b[1] - a[1]);
  if (candidates.length > 0) {
    return candidates[0][0].replace("over_", "Over ").replace("_", ".");
  }
  const underCandidates = Object.entries(goalLines)
    .filter(([k, v]) => k.startsWith("under_") && v >= 0.55 && v <= 0.85)
    .sort((a, b) => b[1] - a[1]);
  if (underCandidates.length > 0) {
    return underCandidates[0][0].replace("under_", "Under ").replace("_", ".");
  }
  return goalLines.over_2_5 > 0.5 ? "Over 2.5" : "Under 2.5";
}

const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);
const LIVE_STATUSES = new Set(["1H", "2H", "HT", "ET", "BT", "P"]);
const CANCELLED_STATUSES = new Set(["PST", "CANC", "ABD", "AWD", "WO"]);

function mapStatus(apiStatus: string): string {
  if (FINISHED_STATUSES.has(apiStatus)) return "completed";
  if (LIVE_STATUSES.has(apiStatus)) return "live";
  if (CANCELLED_STATUSES.has(apiStatus)) return "cancelled";
  return "upcoming";
}

// ─── Rate-limit–aware API fetcher ───
let apiCallCount = 0;
let apiRemainingDaily = Infinity;
let callBudget = 100; // overridden per mode

async function apiFetch(path: string, apiKey: string) {
  if (apiCallCount >= callBudget) {
    console.warn(`Budget exhausted (${apiCallCount}/${callBudget}), skipping: ${path}`);
    return [];
  }
  if (apiRemainingDaily <= 5) {
    console.warn(`Daily API limit nearly exhausted (${apiRemainingDaily} left), skipping: ${path}`);
    return [];
  }
  const url = `${API_BASE}${path}`;
  console.log(`[${++apiCallCount}] Fetching: ${url}`);
  const res = await fetch(url, {
    headers: { "x-apisports-key": apiKey },
  });
  if (!res.ok) throw new Error(`API-Football error: ${res.status} ${await res.text()}`);

  // Track rate limits from headers
  const remaining = res.headers.get("x-ratelimit-requests-remaining");
  if (remaining) {
    apiRemainingDaily = parseInt(remaining, 10);
    console.log(`API calls remaining today: ${apiRemainingDaily}`);
  }
  const perMinRemaining = res.headers.get("x-ratelimit-requests-remaining-minute") ?? res.headers.get("X-RateLimit-Remaining");
  if (perMinRemaining && parseInt(perMinRemaining, 10) <= 2) {
    console.log("Per-minute rate limit low, waiting 10s...");
    await delay(10000);
  }

  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    console.error("API errors:", JSON.stringify(json.errors));
  }
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

    // Parse mode from request body — supports 4 modes: idle, pre_match, live, full
    let mode = "live";
    try {
      const body = await req.json();
      mode = body.mode ?? "live";
    } catch { /* no body = live (backwards compat) */ }

    // Map legacy "quick" mode to "live"
    if (mode === "quick") mode = "live";

    // Reset counters with mode-specific budgets
    apiCallCount = 0;
    apiRemainingDaily = Infinity;
    const budgets: Record<string, number> = { idle: 30, pre_match: 50, live: 80, full: 250 };
    callBudget = budgets[mode] ?? 80;

    console.log(`=== sync-football-data mode=${mode} budget=${callBudget} ===`);

    const summary = { teams: 0, matches: 0, predictions: 0, standings: 0, teamStats: 0, h2h: 0, lineups: 0, players: 0, liveUpdated: 0, logosUpdated: 0 };

    // Load ALL existing teams from DB
    const { data: existingTeams } = await supabase.from("teams").select("id, name, api_football_id, logo_url, sportradar_id");
    const teamsByResolvedName = new Map<string, any>();
    const teamsByApiId = new Map<number, any>();
    existingTeams?.forEach((t) => {
      teamsByResolvedName.set(resolveTeamName(t.name), t);
      if (t.api_football_id) teamsByApiId.set(t.api_football_id, t);
    });

    // ════════════════════════════════════════════
    // P0: Live fixtures — skip in idle mode (1 call with league filter)
    // ════════════════════════════════════════════
    if (mode !== "idle") {
      try {
        const liveFixtures = await apiFetch(`/fixtures?live=${LEAGUE_IDS_STRING}`, apiKey);
        await delay(500);
        if (liveFixtures.length > 0) {
          console.log(`Found ${liveFixtures.length} live fixtures in tracked leagues`);
          for (const f of liveFixtures) {
            const homeTeam = teamsByApiId.get(f.teams.home.id);
            const awayTeam = teamsByApiId.get(f.teams.away.id);
            if (!homeTeam || !awayTeam) continue;

            const status = mapStatus(f.fixture.status.short);
            const elapsed = f.fixture.status.elapsed ?? null;
            const { data: updated, error } = await supabase.from("matches")
              .update({
                goals_home: f.goals.home ?? 0,
                goals_away: f.goals.away ?? 0,
                status: status === "live" ? status : (FINISHED_STATUSES.has(f.fixture.status.short) ? "completed" : status),
              })
              .eq("api_football_id", f.fixture.id)
              .select("id");
            if (!error && updated?.length) {
              summary.liveUpdated++;
              console.log(`Live: ${f.teams.home.name} ${f.goals.home}-${f.goals.away} ${f.teams.away.name} (${f.fixture.status.short} ${elapsed}')`);
            }
          }
        }
      } catch (e) {
        console.error("Error fetching live fixtures:", e);
      }
    } else {
      console.log("idle mode: skipping live fixtures fetch");
    }

    // ════════════════════════════════════════════
    // P0: Today + yesterday's fixtures — skip in idle mode
    // Only update matches we track (have api_football_id in our DB)
    // ════════════════════════════════════════════
    if (mode !== "idle") {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const datesToSync = [today];
      if (yesterday !== today) datesToSync.push(yesterday);

      // Get all api_football_ids we track for quick lookup
      const { data: trackedMatches } = await supabase.from("matches")
        .select("api_football_id")
        .not("api_football_id", "is", null)
        .gte("match_date", yesterday + "T00:00:00Z")
        .lte("match_date", today + "T23:59:59Z");
      const trackedIds = new Set((trackedMatches ?? []).map(m => m.api_football_id));

      for (const dateStr of datesToSync) {
        try {
          const fixtures = await apiFetch(`/fixtures?date=${dateStr}`, apiKey);
          await delay(500);
          if (fixtures.length > 0) {
            console.log(`Found ${fixtures.length} fixtures for ${dateStr}, tracking ${trackedIds.size} of ours`);
            const updates: { api_football_id: number; goals_home: number; goals_away: number; status: string }[] = [];
            for (const f of fixtures) {
              if (!trackedIds.has(f.fixture.id)) continue;
              const status = mapStatus(f.fixture.status.short);
              if (status === "upcoming") continue;
              updates.push({
                api_football_id: f.fixture.id,
                goals_home: f.goals.home,
                goals_away: f.goals.away,
                status,
              });
            }
            for (const u of updates) {
              const { data: updated, error } = await supabase.from("matches")
                .update({ goals_home: u.goals_home, goals_away: u.goals_away, status: u.status })
                .eq("api_football_id", u.api_football_id)
                .select("id");
              if (!error && updated?.length) summary.liveUpdated++;
            }
            console.log(`Updated ${updates.length} tracked fixtures for ${dateStr}`);
          }
        } catch (e) {
          console.error(`Error fetching fixtures for ${dateStr}:`, e);
        }
      }
    } else {
      console.log("idle mode: skipping today/yesterday fixtures fetch");
    }

    // ════════════════════════════════════════════
    // P1: Upcoming fixtures per league (next=15) — ~20 calls
    // Also fetch last=5 to update recent final scores
    // ════════════════════════════════════════════
    // Collect all upcoming fixture API IDs for batch operations later
    const allUpcomingFixtures: any[] = [];
    const allRecentFixtures: any[] = [];
    const globalTeamUuidMap = new Map<number, string>();
    // Pre-populate from existing teams
    teamsByApiId.forEach((t, apiId) => globalTeamUuidMap.set(apiId, t.id));

    for (const league of LEAGUES) {
      if (apiCallCount >= callBudget) break;

      // Fetch upcoming fixtures (1 call per league)
      try {
        const upcoming = await apiFetch(`/fixtures?league=${league.id}&season=${SEASON}&next=15`, apiKey);
        await delay(400);

        // Process teams from upcoming fixtures
        const teamsToUpsert = new Map<number, any>();
        const teamsToUpdateLogo: { id: string; api_football_id: number; logo_url: string }[] = [];

        for (const f of upcoming) {
          f._league = league; // attach league info
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

        // Upsert new teams
        for (const upd of teamsToUpdateLogo) {
          const { error } = await supabase.from("teams")
            .update({ api_football_id: upd.api_football_id, logo_url: upd.logo_url })
            .eq("id", upd.id);
          if (!error) summary.logosUpdated++;
        }
        if (teamsToUpsert.size > 0) {
          const { error } = await supabase.from("teams")
            .upsert(Array.from(teamsToUpsert.values()), { onConflict: "api_football_id", ignoreDuplicates: false });
          if (!error) summary.teams += teamsToUpsert.size;
        }

        // Refresh UUID map for new teams
        if (teamsToUpsert.size > 0) {
          const newApiIds = Array.from(teamsToUpsert.keys());
          const { data: newDbTeams } = await supabase.from("teams").select("id, api_football_id").in("api_football_id", newApiIds);
          for (const t of newDbTeams ?? []) if (t.api_football_id) globalTeamUuidMap.set(t.api_football_id, t.id);
        }

        allUpcomingFixtures.push(...upcoming);
      } catch (e) {
        console.error(`Error fetching upcoming for ${league.name}:`, e);
      }

      // In full mode also fetch last=5 for recent results (1 call per league)
      if (mode === "full" && apiCallCount < callBudget) {
        try {
          const recent = await apiFetch(`/fixtures?league=${league.id}&season=${SEASON}&last=5`, apiKey);
          await delay(400);
          for (const f of recent) f._league = league;
          allRecentFixtures.push(...recent);
        } catch (e) {
          console.error(`Error fetching recent for ${league.name}:`, e);
        }
      }
    }

    // Upsert all upcoming matches
    const upcomingMatchRows = allUpcomingFixtures.map((f: any) => {
      const status = mapStatus(f.fixture.status.short);
      const isFinished = status === "completed";
      const homeUuid = globalTeamUuidMap.get(f.teams.home.id);
      const awayUuid = globalTeamUuidMap.get(f.teams.away.id);
      if (!homeUuid || !awayUuid) return null;
      return {
        api_football_id: f.fixture.id,
        match_date: f.fixture.date,
        team_home_id: homeUuid,
        team_away_id: awayUuid,
        goals_home: (status === "live" || isFinished) ? f.goals.home : null,
        goals_away: (status === "live" || isFinished) ? f.goals.away : null,
        status,
        league: f._league.name,
        round: f.league.round ?? null,
        referee: f.fixture.referee ?? null,
      };
    }).filter(Boolean);

    if (upcomingMatchRows.length > 0) {
      const { error } = await supabase.from("matches")
        .upsert(upcomingMatchRows, { onConflict: "api_football_id", ignoreDuplicates: false });
      if (error) console.error("upcoming matches upsert error:", error);
      else summary.matches += upcomingMatchRows.length;
    }

    // Upsert recent matches (full mode)
    if (allRecentFixtures.length > 0) {
      const recentRows = allRecentFixtures.map((f: any) => {
        const status = mapStatus(f.fixture.status.short);
        const homeUuid = globalTeamUuidMap.get(f.teams.home.id);
        const awayUuid = globalTeamUuidMap.get(f.teams.away.id);
        if (!homeUuid || !awayUuid) return null;
        return {
          api_football_id: f.fixture.id,
          match_date: f.fixture.date,
          team_home_id: homeUuid,
          team_away_id: awayUuid,
          goals_home: f.goals.home,
          goals_away: f.goals.away,
          status,
          league: f._league.name,
          round: f.league.round ?? null,
          referee: f.fixture.referee ?? null,
        };
      }).filter(Boolean);
      if (recentRows.length > 0) {
        const { error } = await supabase.from("matches")
          .upsert(recentRows, { onConflict: "api_football_id", ignoreDuplicates: false });
        if (error) console.error("recent matches upsert error:", error);
        else summary.matches += recentRows.length;
      }
    }

    // Build match UUID map for upcoming fixtures
    const allFixtureApiIds = [...allUpcomingFixtures, ...allRecentFixtures].map((f: any) => f.fixture.id);
    const matchUuidMap = new Map<number, string>();
    if (allFixtureApiIds.length > 0) {
      // Batch in chunks of 100 for the IN query
      for (let i = 0; i < allFixtureApiIds.length; i += 100) {
        const chunk = allFixtureApiIds.slice(i, i + 100);
        const { data: dbMatches } = await supabase.from("matches")
          .select("id, api_football_id").in("api_football_id", chunk);
        for (const m of dbMatches ?? []) if (m.api_football_id) matchUuidMap.set(m.api_football_id, m.id);
      }
    }

    // ════════════════════════════════════════════
    // P2: Standings — only in full mode or if stale (>6h)
    // ════════════════════════════════════════════
    if (mode === "full") {
      // Check which leagues need standings refresh
      const { data: leagueRows } = await supabase.from("leagues")
        .select("api_football_id, updated_at");
      const leagueLastUpdate = new Map<number, string>();
      for (const l of leagueRows ?? []) leagueLastUpdate.set(l.api_football_id, l.updated_at);

      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

      for (const league of LEAGUES) {
        if (apiCallCount >= callBudget) break;
        const lastUpdate = leagueLastUpdate.get(league.id);
        if (lastUpdate && lastUpdate > sixHoursAgo) {
          console.log(`Standings for ${league.name} still fresh (updated ${lastUpdate}), skipping`);
          continue;
        }
        try {
          const standingsData = await apiFetch(`/standings?league=${league.id}&season=${SEASON}`, apiKey);
          await delay(400);
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
              if (!error) summary.standings++;
            }
          }
        } catch (e) {
          console.error(`Standings error for ${league.name}:`, e);
        }
      }
    }

    // ════════════════════════════════════════════
    // P2: H2H for upcoming matches — skip in idle mode
    // Only 3 per league in live/pre_match, 5 in full
    // ════════════════════════════════════════════
    if (mode !== "idle") {
      const h2hLimit = mode === "full" ? 5 : 3;
      const upcomingForH2H = allUpcomingFixtures
        .filter((f: any) => mapStatus(f.fixture.status.short) === "upcoming")
        .slice(0, h2hLimit * 3);

      const h2hMatchIds = upcomingForH2H.map(f => matchUuidMap.get(f.fixture.id)).filter(Boolean) as string[];
      const { data: existingH2H } = await supabase.from("match_features")
        .select("match_id").in("match_id", h2hMatchIds.slice(0, 50))
        .not("h2h_results", "is", null);
      const existingH2HSet = new Set((existingH2H ?? []).map(r => r.match_id));

      let h2hFetched = 0;
      for (const f of upcomingForH2H) {
        if (apiCallCount >= callBudget || h2hFetched >= (mode === "full" ? 10 : 5)) break;
        const matchId = matchUuidMap.get(f.fixture.id);
        if (!matchId || existingH2HSet.has(matchId)) continue;
        try {
          const h2hData = await apiFetch(`/fixtures/headtohead?h2h=${f.teams.home.id}-${f.teams.away.id}&last=5`, apiKey);
          await delay(400);
          if (h2hData.length > 0) {
            const h2hResults = h2hData.map((h: any) => ({
              date: h.fixture.date, home: h.teams.home.name, away: h.teams.away.name,
              score_home: h.goals.home, score_away: h.goals.away,
            }));
            await supabase.from("match_features").upsert({
              match_id: matchId, h2h_results: h2hResults, computed_at: new Date().toISOString(),
            }, { onConflict: "match_id" });
            summary.h2h++;
            h2hFetched++;
          }
        } catch (e) {
          console.error(`H2H error for fixture ${f.fixture.id}:`, e);
        }
      }
    }

    // ════════════════════════════════════════════
    // P2: Lineups for imminent matches
    // idle: skip entirely | pre_match: within 1h, up to 10 | live/full: within 2h, up to 5
    // ════════════════════════════════════════════
    if (mode !== "idle") {
      const lineupWindowMs = mode === "pre_match" ? 1 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
      const lineupCap = mode === "pre_match" ? 10 : 5;
      const lineupCutoff = new Date(Date.now() + lineupWindowMs).toISOString();
      const nowIso = new Date().toISOString();
      const soonMatches = allUpcomingFixtures.filter((f: any) => {
        const matchTime = new Date(f.fixture.date).toISOString();
        return matchTime <= lineupCutoff && matchTime >= nowIso && mapStatus(f.fixture.status.short) === "upcoming";
      }).slice(0, lineupCap);

      for (const f of soonMatches) {
        if (apiCallCount >= callBudget) break;
        const matchId = matchUuidMap.get(f.fixture.id);
        if (!matchId) continue;
        try {
          const lineups = await apiFetch(`/fixtures/lineups?fixture=${f.fixture.id}`, apiKey);
          await delay(400);
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
    }

    // ════════════════════════════════════════════
    // P3: Team statistics — FULL mode only, max 5 per league
    // ════════════════════════════════════════════
    if (mode === "full") {
      for (const league of LEAGUES) {
        if (apiCallCount >= callBudget) break;
        if (league.type !== "league") continue; // Skip cups for team stats

        const { data: leagueRow } = await supabase.from("leagues")
          .select("id").eq("api_football_id", league.id).single();
        if (!leagueRow) continue;

        // Get team IDs from upcoming fixtures for this league
        const leagueUpcoming = allUpcomingFixtures.filter((f: any) => f._league.id === league.id);
        const teamApiIds = [...new Set(leagueUpcoming.flatMap((f: any) => [f.teams.home.id, f.teams.away.id]))].slice(0, 5);

        for (const teamApiId of teamApiIds) {
          if (apiCallCount >= callBudget) break;
          try {
            const stats = await apiFetch(`/teams/statistics?team=${teamApiId}&league=${league.id}&season=${SEASON}`, apiKey);
            await delay(400);
            if (stats && stats.fixtures) {
              const teamUuid = globalTeamUuidMap.get(teamApiId);
              if (!teamUuid) continue;
              const played = stats.fixtures.played?.total ?? 0;
              const goalsFor = stats.goals?.for?.total?.total ?? 0;
              const goalsAgainst = stats.goals?.against?.total?.total ?? 0;
              const { error } = await supabase.from("team_statistics").upsert({
                team_id: teamUuid, league_id: leagueRow.id, season: SEASON,
                matches_played: played,
                wins: stats.fixtures.wins?.total ?? 0,
                draws: stats.fixtures.draws?.total ?? 0,
                losses: stats.fixtures.loses?.total ?? 0,
                goals_for: goalsFor, goals_against: goalsAgainst, goal_diff: goalsFor - goalsAgainst,
                form: stats.form ?? null,
                home_record: {
                  played: stats.fixtures.played?.home ?? 0, wins: stats.fixtures.wins?.home ?? 0,
                  draws: stats.fixtures.draws?.home ?? 0, losses: stats.fixtures.loses?.home ?? 0,
                  goals_for: stats.goals?.for?.total?.home ?? 0, goals_against: stats.goals?.against?.total?.home ?? 0,
                },
                away_record: {
                  played: stats.fixtures.played?.away ?? 0, wins: stats.fixtures.wins?.away ?? 0,
                  draws: stats.fixtures.draws?.away ?? 0, losses: stats.fixtures.loses?.away ?? 0,
                  goals_for: stats.goals?.for?.total?.away ?? 0, goals_against: stats.goals?.against?.total?.away ?? 0,
                },
                clean_sheets: stats.clean_sheet?.total ?? 0,
                failed_to_score: stats.failed_to_score?.total ?? 0,
                avg_goals_scored: played > 0 ? Math.round((goalsFor / played) * 100) / 100 : 0,
                avg_goals_conceded: played > 0 ? Math.round((goalsAgainst / played) * 100) / 100 : 0,
                updated_at: new Date().toISOString(),
              }, { onConflict: "team_id,league_id,season" });
              if (!error) summary.teamStats++;
            }
          } catch (e) {
            console.error(`Team stats error for ${teamApiId}:`, e);
          }
        }
      }
    }

    // ════════════════════════════════════════════
    // P3: Predictions — FULL mode only, use our own Poisson model
    // Skip API predictions endpoint entirely to save calls
    // ════════════════════════════════════════════
    if (mode === "full") {
      const unpredicted = allUpcomingFixtures.filter((f: any) => mapStatus(f.fixture.status.short) === "upcoming");
      // Check which already have predictions
      const upcomingMatchIdsForPred = unpredicted
        .map(f => matchUuidMap.get(f.fixture.id))
        .filter(Boolean) as string[];
      const { data: existingPreds } = await supabase.from("predictions")
        .select("match_id").in("match_id", upcomingMatchIdsForPred.slice(0, 100));
      const existingPredSet = new Set((existingPreds ?? []).map(r => r.match_id));

      for (const f of unpredicted) {
        const matchId = matchUuidMap.get(f.fixture.id);
        if (!matchId || existingPredSet.has(matchId)) continue;

        // Use league average goals as fallback (1.3 home, 1.1 away)
        const homeGoalAvg = 1.3;
        const awayGoalAvg = 1.1;

        // Try to get team stats from DB for better estimates
        const homeUuid = globalTeamUuidMap.get(f.teams.home.id);
        const awayUuid = globalTeamUuidMap.get(f.teams.away.id);
        let lambdaH = homeGoalAvg, lambdaA = awayGoalAvg;

        if (homeUuid && awayUuid) {
          const { data: homeStats } = await supabase.from("team_statistics")
            .select("avg_goals_scored, avg_goals_conceded").eq("team_id", homeUuid).single();
          const { data: awayStats } = await supabase.from("team_statistics")
            .select("avg_goals_scored, avg_goals_conceded").eq("team_id", awayUuid).single();
          if (homeStats && awayStats) {
            lambdaH = (Number(homeStats.avg_goals_scored) + Number(awayStats.avg_goals_conceded)) / 2;
            lambdaA = (Number(awayStats.avg_goals_scored) + Number(homeStats.avg_goals_conceded)) / 2;
          }
        }

        const goalLines = computeGoalLines(lambdaH, lambdaA);
        const homeWin = poissonHomeWin(lambdaH, lambdaA);
        const drawProb = poissonDraw(lambdaH, lambdaA);
        const awayWin = 1 - homeWin - drawProb;

        const { error } = await supabase.from("predictions").upsert({
          match_id: matchId,
          home_win: Math.round(homeWin * 1000) / 1000,
          draw: Math.round(drawProb * 1000) / 1000,
          away_win: Math.round(awayWin * 1000) / 1000,
          expected_goals_home: Math.round(lambdaH * 100) / 100,
          expected_goals_away: Math.round(lambdaA * 100) / 100,
          over_under_25: goalLines.over_2_5 > 0.5 ? "over" : "under",
          model_confidence: Math.max(homeWin, drawProb, awayWin),
          goal_lines: goalLines,
          goal_distribution: computeGoalDistribution(lambdaH, lambdaA),
          best_pick: findBestPick(goalLines),
          best_pick_confidence: Math.max(...Object.values(goalLines)),
        }, { onConflict: "match_id" });
        if (!error) summary.predictions++;
      }
    }

    // ════════════════════════════════════════════
    // P3: Players — FULL mode only, domestic leagues
    // ════════════════════════════════════════════
    if (mode === "full") {
      for (const league of LEAGUES) {
        if (apiCallCount >= callBudget) break;
        if (league.type !== "league") continue;
        try {
          const playersData = await apiFetch(`/players?league=${league.id}&season=${SEASON}&page=1`, apiKey);
          await delay(400);
          for (const entry of playersData) {
            const p = entry.player;
            const stats = entry.statistics?.[0];
            const teamApiId = stats?.team?.id;
            const teamUuid = teamApiId ? (globalTeamUuidMap.get(teamApiId) ?? teamsByApiId.get(teamApiId)?.id) : null;
            if (!p?.id) continue;
            const { error } = await supabase.from("players").upsert({
              api_football_id: p.id, name: p.name,
              position: stats?.games?.position ?? p.position ?? null,
              age: p.age ?? null, nationality: p.nationality ?? null,
              photo_url: p.photo ?? null, team_id: teamUuid ?? null,
              updated_at: new Date().toISOString(),
            }, { onConflict: "api_football_id" });
            if (!error) summary.players++;
          }
        } catch (e) {
          console.error(`Players error for ${league.name}:`, e);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, mode, summary, apiCalls: apiCallCount, budgetRemaining: callBudget - apiCallCount }), {
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

// ─── Poisson helpers for 1X2 probabilities ───
function poissonHomeWin(lambdaH: number, lambdaA: number): number {
  let p = 0;
  for (let h = 1; h <= 8; h++)
    for (let a = 0; a < h; a++)
      p += poissonPMF(lambdaH, h) * poissonPMF(lambdaA, a);
  return p;
}

function poissonDraw(lambdaH: number, lambdaA: number): number {
  let p = 0;
  for (let k = 0; k <= 8; k++)
    p += poissonPMF(lambdaH, k) * poissonPMF(lambdaA, k);
  return p;
}
