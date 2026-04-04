import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "https://api.sportradar.com/soccer/trial/v4/en";

const ALL_LEAGUES: Record<string, { seasonId: string; league: string; country: string }> = {
  premier_league: { seasonId: "sr:season:130281", league: "Premier League", country: "England" },
  la_liga: { seasonId: "sr:season:130805", league: "La Liga", country: "Spain" },
  serie_a: { seasonId: "sr:season:130971", league: "Serie A", country: "Italy" },
  bundesliga: { seasonId: "sr:season:130571", league: "Bundesliga", country: "Germany" },
  ligue_1: { seasonId: "sr:season:131609", league: "Ligue 1", country: "France" },
  // International competitions — verified IDs
  wc_qualifiers_europe: { seasonId: "sr:season:127075", league: "WC Qualifiers Europe", country: "World" },
  wc_qualifiers_conmebol: { seasonId: "sr:season:109025", league: "WC Qualifiers CONMEBOL", country: "World" },
  wc_qualifiers_concacaf: { seasonId: "sr:season:115355", league: "WC Qualifiers CONCACAF", country: "World" },
  world_cup_2026: { seasonId: "sr:season:101177", league: "World Cup 2026", country: "World" },
  // New competitions
  champions_league: { seasonId: "sr:season:131071", league: "Champions League", country: "Europe" },
  europa_league: { seasonId: "sr:season:131073", league: "Europa League", country: "Europe" },
  eredivisie: { seasonId: "sr:season:130587", league: "Eredivisie", country: "Netherlands" },
  womens_champions_league: { seasonId: "sr:season:131075", league: "Women's Champions League", country: "Europe" },
};

const TEAM_NAME_ALIASES: Record<string, string> = {
  // England
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
  "aston villa fc": "aston villa",
  "nottingham forest fc": "nottingham forest",
  "leicester city fc": "leicester city",
  "leicester city": "leicester",
  "crystal palace fc": "crystal palace",
  "everton fc": "everton",
  "fulham fc": "fulham",
  "bournemouth": "afc bournemouth",
  "afc bournemouth": "bournemouth",
  "ipswich town fc": "ipswich town",
  "ipswich town": "ipswich",
  "southampton fc": "southampton",
  "brentford fc": "brentford",
  // Spain
  "real madrid cf": "real madrid",
  "fc barcelona": "barcelona",
  "rcd espanyol": "espanyol",
  "real sociedad de fútbol": "real sociedad",
  "real betis balompié": "real betis",
  "real betis": "betis",
  "villarreal cf": "villarreal",
  "sevilla fc": "sevilla",
  "valencia cf": "valencia",
  "ca osasuna": "osasuna",
  "rcd mallorca": "mallorca",
  "celta de vigo": "celta vigo",
  "rc celta de vigo": "celta vigo",
  "getafe cf": "getafe",
  "deportivo alavés": "alaves",
  "deportivo alaves": "alaves",
  "girona fc": "girona",
  "athletic club": "athletic bilbao",
  "athletic de bilbao": "athletic bilbao",
  // Italy
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
  // Germany
  "fc bayern münchen": "bayern munich",
  "fc bayern munich": "bayern munich",
  "bayern münchen": "bayern munich",
  "borussia dortmund": "dortmund",
  "bvb borussia dortmund": "dortmund",
  "bayer 04 leverkusen": "bayer leverkusen",
  "bayer leverkusen": "leverkusen",
  "rb leipzig": "leipzig",
  "rasenballsport leipzig": "leipzig",
  "vfb stuttgart": "stuttgart",
  "eintracht frankfurt": "frankfurt",
  "sg eintracht frankfurt": "frankfurt",
  "borussia mönchengladbach": "monchengladbach",
  "borussia monchengladbach": "monchengladbach",
  "vfl wolfsburg": "wolfsburg",
  "sc freiburg": "freiburg",
  "sport-club freiburg": "freiburg",
  "1. fc union berlin": "union berlin",
  "fc union berlin": "union berlin",
  "tsg 1899 hoffenheim": "hoffenheim",
  "tsg hoffenheim": "hoffenheim",
  "1. fsv mainz 05": "mainz",
  "fsv mainz 05": "mainz",
  "fc augsburg": "augsburg",
  "1. fc heidenheim 1846": "heidenheim",
  "fc heidenheim": "heidenheim",
  "sv werder bremen": "werder bremen",
  "werder bremen": "bremen",
  "vfl bochum 1848": "bochum",
  "vfl bochum": "bochum",
  "fc st. pauli": "st. pauli",
  "holstein kiel": "kiel",
  // France
  "paris saint-germain": "psg",
  "paris saint-germain fc": "psg",
  "olympique de marseille": "marseille",
  "olympique marseille": "marseille",
  "as monaco": "monaco",
  "as monaco fc": "monaco",
  "olympique lyonnais": "lyon",
  "olympique lyon": "lyon",
  "losc lille": "lille",
  "losc lille métropole": "lille",
  "stade rennais fc": "rennes",
  "stade rennais": "rennes",
  "rc lens": "lens",
  "racing club de lens": "lens",
  "ogc nice": "nice",
  "rc strasbourg alsace": "strasbourg",
  "rc strasbourg": "strasbourg",
  "fc nantes": "nantes",
  "stade brestois 29": "brest",
  "stade brest": "brest",
  "toulouse fc": "toulouse",
  "montpellier hsc": "montpellier",
  "montpellier hérault sc": "montpellier",
  "le havre ac": "le havre",
  "stade de reims": "reims",
  "as saint-étienne": "saint-etienne",
  "as saint-etienne": "saint-etienne",
  "angers sco": "angers",
  "aj auxerre": "auxerre",
  // Women's teams
  "chelsea fc women": "chelsea women",
  "arsenal wfc": "arsenal women",
  "fc barcelona femení": "barcelona women",
  "fc barcelona women": "barcelona women",
  "olympique lyonnais women": "lyon women",
  "olympique lyonnais féminin": "lyon women",
  "vfl wolfsburg women": "wolfsburg women",
  "vfl wolfsburg frauen": "wolfsburg women",
  "real madrid femenino": "real madrid women",
  "real madrid cf women": "real madrid women",
  "bayern munich women": "bayern munich women",
  "fc bayern münchen women": "bayern munich women",
  "fc bayern münchen frauen": "bayern munich women",
  "paris saint-germain women": "psg women",
  "paris saint-germain féminin": "psg women",
  "manchester city women": "manchester city women",
  "manchester city wfc": "manchester city women",
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

function mapStatus(srStatus: string | undefined, matchDate?: string): string {
  if (srStatus) {
    const s = srStatus.toLowerCase();
    if (s === "closed" || s === "ended") return "completed";
    if (s === "live" || s === "inprogress" || s === "halftime") return "live";
  }
  // If match date is in the past, treat as completed
  if (matchDate) {
    const d = new Date(matchDate);
    if (d < new Date()) return "completed";
  }
  return "upcoming";
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

    // Support optional ?league= param for per-league sync
    const url = new URL(req.url);
    const leagueParam = url.searchParams.get("league");

    let leaguesToSync: Record<string, { seasonId: string; league: string; country: string }>;
    if (leagueParam && ALL_LEAGUES[leagueParam]) {
      leaguesToSync = { [leagueParam]: ALL_LEAGUES[leagueParam] };
    } else {
      leaguesToSync = ALL_LEAGUES;
    }

    const summary = { teamsCreated: 0, teamsMatched: 0, matchesCreated: 0, matchesMatched: 0, probabilitiesSynced: 0, errors: [] as string[] };

    // Load existing teams into lookup maps
    const { data: existingTeams } = await supabase.from("teams").select("id, name, sportradar_id");
    const teamsByName = new Map<string, any>();
    const teamsBySrId = new Map<string, any>();
    existingTeams?.forEach((t) => {
      teamsByName.set(resolveTeamName(t.name), t);
      if (t.sportradar_id) teamsBySrId.set(t.sportradar_id, t);
    });

    const GARBAGE_SUFFIXES = ["outreach", "cup", "joint", "copier", "glasgow", "sint-petersburg"];

    function isGarbageName(name: string): boolean {
      const lower = name.toLowerCase();
      return GARBAGE_SUFFIXES.some((s) => lower.includes(s));
    }

    async function findOrCreateTeam(comp: any, league: string, country: string) {
      if (isGarbageName(comp.name)) return null;

      if (teamsBySrId.has(comp.id)) return teamsBySrId.get(comp.id);

      const resolved = resolveTeamName(comp.name);
      if (teamsByName.has(resolved)) {
        const existing = teamsByName.get(resolved);
        if (!existing.sportradar_id) {
          await supabase.from("teams").update({ sportradar_id: comp.id }).eq("id", existing.id);
          existing.sportradar_id = comp.id;
          teamsBySrId.set(comp.id, existing);
          summary.teamsMatched++;
        }
        return existing;
      }

      const { data: newTeam, error } = await supabase
        .from("teams")
        .insert({ name: comp.name, league, country, sportradar_id: comp.id })
        .select("id, name, sportradar_id")
        .single();

      if (error) {
        summary.errors.push(`Team insert error (${comp.name}): ${error.message}`);
        return null;
      }

      teamsByName.set(resolveTeamName(newTeam.name), newTeam);
      teamsBySrId.set(comp.id, newTeam);
      summary.teamsCreated++;
      return newTeam;
    }

    for (const [_key, config] of Object.entries(leaguesToSync)) {
      console.log(`Syncing ${config.league} (${config.seasonId})...`);

      const schedData = await srFetch(`/seasons/${config.seasonId}/schedules.json`, apiKey);
      await delay(1200);

      if (!schedData?.schedules) {
        summary.errors.push(`No schedules for ${config.league}`);
        continue;
      }

      // Pre-load existing matches for this league to avoid per-match DB queries
      const { data: existingMatches } = await supabase
        .from("matches")
        .select("id, sportradar_id, team_home_id, team_away_id, match_date, status")
        .eq("league", config.league);

      const matchesBySrId = new Map<string, any>();
      const matchesByKey = new Map<string, any>();
      existingMatches?.forEach((m) => {
        if (m.sportradar_id) matchesBySrId.set(m.sportradar_id, m);
        const dateKey = m.match_date?.substring(0, 10);
        matchesByKey.set(`${m.team_home_id}_${m.team_away_id}_${dateKey}`, m);
      });

      const newMatches: any[] = [];
      const updateBatch: { id: string; data: any }[] = [];

      for (const sched of schedData.schedules) {
        const event = sched.sport_event;
        const status = sched.sport_event_status;
        if (!event?.competitors || event.competitors.length < 2) continue;

        const homeComp = event.competitors.find((c: any) => c.qualifier === "home");
        const awayComp = event.competitors.find((c: any) => c.qualifier === "away");
        if (!homeComp || !awayComp) continue;

        const homeTeam = await findOrCreateTeam(homeComp, config.league, config.country);
        const awayTeam = await findOrCreateTeam(awayComp, config.league, config.country);
        if (!homeTeam || !awayTeam) continue;

        const eventDate = event.start_time?.substring(0, 10);
        const matchStatus = mapStatus(status?.status, event.start_time);

        // Check existing by sportradar_id
        if (matchesBySrId.has(event.id)) {
          const existing = matchesBySrId.get(event.id);
          const updateData: any = { status: matchStatus };
          // Always backfill scores if available from API
          if (status?.home_score != null && status?.away_score != null) {
            updateData.goals_home = status.home_score;
            updateData.goals_away = status.away_score;
          }
          updateBatch.push({ id: existing.id, data: updateData });
          summary.matchesMatched++;
          continue;
        }

        // Check by teams + date — backfill scores + sportradar_id
        const teamDateKey = `${homeTeam.id}_${awayTeam.id}_${eventDate}`;
        if (matchesByKey.has(teamDateKey)) {
          const existing = matchesByKey.get(teamDateKey);
          const updateData: any = {};
          if (!existing.sportradar_id) updateData.sportradar_id = event.id;
          if (matchStatus) updateData.status = matchStatus;
          if (status?.home_score != null && status?.away_score != null) {
            updateData.goals_home = status.home_score;
            updateData.goals_away = status.away_score;
          }
          if (Object.keys(updateData).length > 0) {
            updateBatch.push({ id: existing.id, data: updateData });
          }
          summary.matchesMatched++;
          continue;
        }

        // New match
        const matchData: any = {
          team_home_id: homeTeam.id,
          team_away_id: awayTeam.id,
          match_date: event.start_time || `${eventDate}T00:00:00Z`,
          league: config.league,
          status: matchStatus,
          sportradar_id: event.id,
          round: event.sport_event_context?.round?.number
            ? `Regular Season - ${event.sport_event_context.round.number}`
            : null,
        };

        if (matchStatus === "completed" && status?.home_score != null) {
          matchData.goals_home = status.home_score;
          matchData.goals_away = status.away_score;
        }

        newMatches.push(matchData);
      }

      // Batch insert new matches
      if (newMatches.length > 0) {
        const { error: insertErr, data: inserted } = await supabase
          .from("matches")
          .insert(newMatches)
          .select("id, sportradar_id");
        if (insertErr) {
          summary.errors.push(`Batch match insert error: ${insertErr.message}`);
        } else {
          summary.matchesCreated += inserted?.length || 0;
          inserted?.forEach((m) => {
            if (m.sportradar_id) matchesBySrId.set(m.sportradar_id, m);
          });
        }
      }

      // Batch updates (do them in parallel chunks)
      const updatePromises = updateBatch.map((u) =>
        supabase.from("matches").update(u.data).eq("id", u.id)
      );
      await Promise.all(updatePromises);

      // Fetch probabilities
      const probData = await srFetch(`/seasons/${config.seasonId}/probabilities.json`, apiKey);
      await delay(1200);

      if (probData?.sport_event_probabilities) {
        // Pre-load existing predictions for matched sportradar IDs
        const srIds = probData.sport_event_probabilities
          .map((p: any) => p.sport_event?.id)
          .filter(Boolean);

        // Build a map of sportradar_id -> match_id from our loaded data
        const srToMatchId = new Map<string, string>();
        matchesBySrId.forEach((m, srId) => srToMatchId.set(srId, m.id));

        // Also check DB for any we don't have cached
        const missingSrIds = srIds.filter((id: string) => !srToMatchId.has(id));
        if (missingSrIds.length > 0) {
          const { data: extraMatches } = await supabase
            .from("matches")
            .select("id, sportradar_id")
            .in("sportradar_id", missingSrIds);
          extraMatches?.forEach((m) => {
            if (m.sportradar_id) srToMatchId.set(m.sportradar_id, m.id);
          });
        }

        const predUpserts: any[] = [];

        for (const prob of probData.sport_event_probabilities) {
          const eventId = prob.sport_event?.id;
          if (!eventId || !srToMatchId.has(eventId)) continue;

          const matchId = srToMatchId.get(eventId)!;
          const markets = prob.markets;
          if (!markets) continue;

          const threeWay = markets.find((m: any) => m.name === "3way");
          if (!threeWay?.outcomes) continue;

          let homeWin = threeWay.outcomes.find((o: any) => o.name === "home_team_winner")?.probability || 0;
          let drawProb = threeWay.outcomes.find((o: any) => o.name === "draw")?.probability || 0;
          let awayWin = threeWay.outcomes.find((o: any) => o.name === "away_team_winner")?.probability || 0;

          // Sportradar returns percentages (e.g. 45) — convert to decimal for numeric(4,3)
          if (homeWin > 1 || drawProb > 1 || awayWin > 1) {
            homeWin = homeWin / 100;
            drawProb = drawProb / 100;
            awayWin = awayWin / 100;
          }

          const ouMarket = markets.find((m: any) => m.name === "total" && m.specifier === "2.5");
          let overUnder = "under";
          if (ouMarket?.outcomes) {
            let overProb = ouMarket.outcomes.find((o: any) => o.name === "over")?.probability || 0;
            if (overProb > 1) overProb = overProb / 100;
            overUnder = overProb > 0.5 ? "over" : "under";
          }

          predUpserts.push({
            match_id: matchId,
            home_win: homeWin,
            draw: drawProb,
            away_win: awayWin,
            over_under_25: overUnder,
            model_confidence: Math.max(homeWin, drawProb, awayWin),
            expected_goals_home: 0,
            expected_goals_away: 0,
            goal_lines: null,
            goal_distribution: null,
            best_pick: null,
            best_pick_confidence: null,
          });
        }

        if (predUpserts.length > 0) {
          const { error } = await supabase.from("predictions").upsert(
            predUpserts,
            { onConflict: "match_id", ignoreDuplicates: false }
          );
          if (error) {
            summary.errors.push(`Batch prediction upsert error: ${error.message}`);
          } else {
            summary.probabilitiesSynced += predUpserts.length;
          }
        }
      }
    }

    // Fix stale "upcoming" matches with past dates
    const { error: fixError } = await supabase
      .from("matches")
      .update({ status: "completed" })
      .eq("status", "upcoming")
      .lt("match_date", new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString());

    if (fixError) {
      summary.errors.push(`Fix stale matches error: ${fixError.message}`);
    }

    // Auto-trigger batch predictions for upcoming matches and reviews for completed ones
    try {
      const batchRes = await fetch(`${supabaseUrl}/functions/v1/batch-generate-predictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ limit: 5, mode: "upcoming" }),
      });
      const batchData = await batchRes.json();
      (summary as any).autoGenerated = batchData.generated || 0;
    } catch (e) {
      summary.errors.push(`Auto-prediction trigger failed: ${e.message}`);
    }

    try {
      const reviewRes = await fetch(`${supabaseUrl}/functions/v1/batch-generate-predictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ limit: 3, mode: "review" }),
      });
      const reviewData = await reviewRes.json();
      (summary as any).autoReviewed = reviewData.reviewed || 0;
    } catch (e) {
      summary.errors.push(`Auto-review trigger failed: ${e.message}`);
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
