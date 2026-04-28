import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function poissonPMF(lambda: number, k: number): number {
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) result *= lambda / i;
  return result;
}

// Compute league-specific average goals per game (home & away separately)
function computeLeagueAverages(
  completedMatches: any[],
  league: string
): { homeAvg: number; awayAvg: number; totalAvg: number } {
  const leagueMatches = completedMatches.filter(m => m.league === league);
  if (leagueMatches.length < 10) {
    // Fallback to global average if insufficient league data
    return { homeAvg: 1.45, awayAvg: 1.15, totalAvg: 1.30 };
  }
  let totalHomeGoals = 0, totalAwayGoals = 0;
  for (const m of leagueMatches) {
    totalHomeGoals += m.goals_home ?? 0;
    totalAwayGoals += m.goals_away ?? 0;
  }
  const homeAvg = totalHomeGoals / leagueMatches.length;
  const awayAvg = totalAwayGoals / leagueMatches.length;
  return {
    homeAvg: Math.round(homeAvg * 100) / 100,
    awayAvg: Math.round(awayAvg * 100) / 100,
    totalAvg: Math.round(((homeAvg + awayAvg) / 2) * 100) / 100,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Optional per-match mode: { match_id, as_of }
    let bodyMatchId: string | null = null;
    let bodyAsOf: string | null = null;
    try {
      const body = await req.json();
      bodyMatchId = body?.match_id ?? null;
      bodyAsOf = body?.as_of ?? null;
    } catch { /* no body — full slate mode */ }

    let upcomingMatches: any[] | null = null;
    let matchErr: any = null;
    if (bodyMatchId) {
      // Per-match mode: compute exactly one row, scoped to point-in-time.
      const r = await supabase
        .from("matches")
        .select("id, team_home_id, team_away_id, league, match_date")
        .eq("id", bodyMatchId)
        .maybeSingle();
      matchErr = r.error;
      upcomingMatches = r.data ? [r.data] : [];
    } else {
      const r = await supabase
        .from("matches")
        .select("id, team_home_id, team_away_id, league, match_date")
        .eq("status", "upcoming")
        .order("match_date", { ascending: true })
        .limit(500);
      matchErr = r.error;
      upcomingMatches = r.data ?? null;
    }

    if (matchErr) throw matchErr;
    if (!upcomingMatches || upcomingMatches.length === 0) {
      return new Response(JSON.stringify({ success: true, computed: 0, message: "No matches to compute" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cutoff for time-safe history loading. Per-match: use as_of or match_date. Full slate: no extra filter.
    const cutoffIso: string | null = bodyMatchId
      ? (bodyAsOf ?? upcomingMatches[0].match_date ?? null)
      : null;

    const teamIds = [...new Set(upcomingMatches.flatMap(m => [m.team_home_id, m.team_away_id]))];
    const leagues = [...new Set(upcomingMatches.map(m => m.league))];

    // Get completed matches for form + H2H + league averages
    let completedQ = supabase
      .from("matches")
      .select("team_home_id, team_away_id, goals_home, goals_away, match_date, league, home_team:teams!matches_team_home_id_fkey(name), away_team:teams!matches_team_away_id_fkey(name)")
      .eq("status", "completed")
      .or(teamIds.map(id => `team_home_id.eq.${id},team_away_id.eq.${id}`).join(","))
      .order("match_date", { ascending: false })
      .limit(1000);
    if (cutoffIso) completedQ = completedQ.lt("match_date", cutoffIso);
    const { data: completedMatches } = await completedQ;

    const { data: teamStats } = await supabase
      .from("team_statistics")
      .select("*")
      .in("team_id", teamIds);

    const statsMap = new Map<string, any>();
    teamStats?.forEach(s => statsMap.set(s.team_id, s));

    const { data: leaguesData } = await supabase.from("leagues").select("name, standings_data");
    const { data: teamsData } = await supabase.from("teams").select("id, api_football_id, name").in("id", teamIds);

    const teamNameMap = new Map<string, string>();
    teamsData?.forEach(t => teamNameMap.set(t.id, t.name));

    // Pre-compute league averages for all relevant leagues
    const leagueAvgMap = new Map<string, { homeAvg: number; awayAvg: number; totalAvg: number }>();
    for (const league of leagues) {
      leagueAvgMap.set(league, computeLeagueAverages(completedMatches || [], league));
    }

    // Parse standings to get positions
    const teamPositionMap = new Map<string, number>();
    leaguesData?.forEach(league => {
      const standings = league.standings_data as any[];
      if (!Array.isArray(standings)) return;
      for (const group of standings) {
        if (!Array.isArray(group)) continue;
        for (const entry of group) {
          const apiId = entry?.team?.id;
          if (!apiId) continue;
          teamsData?.forEach(t => {
            if (t.api_football_id === apiId) {
              teamPositionMap.set(t.id, entry.rank);
            }
          });
        }
      }
    });

    // Compute overall form (last 5)
    function computeForm(teamId: string): string {
      const matches = (completedMatches || [])
        .filter(m => m.team_home_id === teamId || m.team_away_id === teamId)
        .slice(0, 5);
      return matches.map(m => {
        const isHome = m.team_home_id === teamId;
        const gf = isHome ? (m.goals_home ?? 0) : (m.goals_away ?? 0);
        const ga = isHome ? (m.goals_away ?? 0) : (m.goals_home ?? 0);
        return gf > ga ? "W" : gf === ga ? "D" : "L";
      }).join("");
    }

    // Compute H2H from completed matches
    function computeH2H(homeId: string, awayId: string): any[] {
      return (completedMatches || [])
        .filter(m =>
          (m.team_home_id === homeId && m.team_away_id === awayId) ||
          (m.team_home_id === awayId && m.team_away_id === homeId)
        )
        .slice(0, 10)
        .map(m => ({
          date: m.match_date,
          home: (m as any).home_team?.name || teamNameMap.get(m.team_home_id) || "?",
          away: (m as any).away_team?.name || teamNameMap.get(m.team_away_id) || "?",
          score_home: m.goals_home,
          score_away: m.goals_away,
        }));
    }

    function computeMatchStats(teamId: string) {
      const matches = (completedMatches || [])
        .filter(m => m.team_home_id === teamId || m.team_away_id === teamId)
        .slice(0, 10);
      if (matches.length === 0) return null;

      let scored = 0, conceded = 0, cleanSheets = 0, bttsCount = 0;
      for (const m of matches) {
        const isHome = m.team_home_id === teamId;
        const gf = isHome ? (m.goals_home ?? 0) : (m.goals_away ?? 0);
        const ga = isHome ? (m.goals_away ?? 0) : (m.goals_home ?? 0);
        scored += gf; conceded += ga;
        if (ga === 0) cleanSheets++;
        if (gf > 0 && ga > 0) bttsCount++;
      }
      return {
        avgScored: scored / matches.length,
        avgConceded: conceded / matches.length,
        cleanSheetPct: cleanSheets / matches.length,
        bttsPct: bttsCount / matches.length,
        played: matches.length,
      };
    }

    // Compute venue-specific scoring rates for home advantage
    function computeVenueStats(teamId: string, asHome: boolean) {
      const matches = (completedMatches || [])
        .filter(m => asHome ? m.team_home_id === teamId : m.team_away_id === teamId)
        .slice(0, 10);
      if (matches.length === 0) return null;
      let scored = 0, conceded = 0;
      for (const m of matches) {
        scored += asHome ? (m.goals_home ?? 0) : (m.goals_away ?? 0);
        conceded += asHome ? (m.goals_away ?? 0) : (m.goals_home ?? 0);
      }
      return {
        avgScored: scored / matches.length,
        avgConceded: conceded / matches.length,
        played: matches.length,
      };
    }

    let computed = 0;
    const errors: string[] = [];

    for (const match of upcomingMatches) {
      try {
        const homeForm = computeForm(match.team_home_id);
        const awayForm = computeForm(match.team_away_id);
        const homeStats = statsMap.get(match.team_home_id);
        const awayStats = statsMap.get(match.team_away_id);
        const homeMatchStats = computeMatchStats(match.team_home_id);
        const awayMatchStats = computeMatchStats(match.team_away_id);
        const h2hResults = computeH2H(match.team_home_id, match.team_away_id);

        // Venue-specific stats for more accurate Poisson
        const homeVenueStats = computeVenueStats(match.team_home_id, true);
        const awayVenueStats = computeVenueStats(match.team_away_id, false);

        const homeAvgScored = homeStats?.avg_goals_scored ?? homeMatchStats?.avgScored ?? 0;
        const homeAvgConceded = homeStats?.avg_goals_conceded ?? homeMatchStats?.avgConceded ?? 0;
        const awayAvgScored = awayStats?.avg_goals_scored ?? awayMatchStats?.avgScored ?? 0;
        const awayAvgConceded = awayStats?.avg_goals_conceded ?? awayMatchStats?.avgConceded ?? 0;

        // Use league-specific averages instead of hardcoded 1.35
        const leagueAvg = leagueAvgMap.get(match.league) || { homeAvg: 1.45, awayAvg: 1.15, totalAvg: 1.30 };

        // Home advantage adjusted Poisson:
        // Home team's lambda = (home attack strength) * (away defense weakness) * league home avg
        // Away team's lambda = (away attack strength) * (home defense weakness) * league away avg
        const homeAttackScoredAtHome = homeVenueStats?.avgScored ?? homeAvgScored;
        const awayAttackScoredAway = awayVenueStats?.avgScored ?? awayAvgScored;

        const hAtk = homeAttackScoredAtHome > 0 ? homeAttackScoredAtHome / leagueAvg.homeAvg : 1;
        const aDefW = awayAvgConceded > 0 ? awayAvgConceded / leagueAvg.totalAvg : 1;
        const aAtk = awayAttackScoredAway > 0 ? awayAttackScoredAway / leagueAvg.awayAvg : 1;
        const hDefW = homeAvgConceded > 0 ? homeAvgConceded / leagueAvg.totalAvg : 1;

        // Home team gets league home average, away team gets league away average
        const poissonHome = Math.round(hAtk * aDefW * leagueAvg.homeAvg * 100) / 100;
        const poissonAway = Math.round(aAtk * hDefW * leagueAvg.awayAvg * 100) / 100;

        const posHome = teamPositionMap.get(match.team_home_id) ?? null;
        const posAway = teamPositionMap.get(match.team_away_id) ?? null;
        const posDiff = (posHome != null && posAway != null) ? posHome - posAway : null;

        const { error } = await supabase.from("match_features").upsert({
          match_id: match.id,
          home_form_last5: homeForm || null,
          away_form_last5: awayForm || null,
          home_avg_scored: Math.round(homeAvgScored * 100) / 100,
          home_avg_conceded: Math.round(homeAvgConceded * 100) / 100,
          away_avg_scored: Math.round(awayAvgScored * 100) / 100,
          away_avg_conceded: Math.round(awayAvgConceded * 100) / 100,
          h2h_results: h2hResults.length > 0 ? h2hResults : null,
          league_position_home: posHome,
          league_position_away: posAway,
          position_diff: posDiff,
          home_clean_sheet_pct: Math.round((homeMatchStats?.cleanSheetPct ?? homeStats?.clean_sheets / Math.max(homeStats?.matches_played, 1) ?? 0) * 100) / 100,
          away_clean_sheet_pct: Math.round((awayMatchStats?.cleanSheetPct ?? awayStats?.clean_sheets / Math.max(awayStats?.matches_played, 1) ?? 0) * 100) / 100,
          home_btts_pct: Math.round((homeMatchStats?.bttsPct ?? 0) * 100) / 100,
          away_btts_pct: Math.round((awayMatchStats?.bttsPct ?? 0) * 100) / 100,
          poisson_xg_home: poissonHome,
          poisson_xg_away: poissonAway,
          computed_at: new Date().toISOString(),
        }, { onConflict: "match_id" });

        if (error) errors.push(`${match.id}: ${error.message}`);
        else computed++;
      } catch (e) {
        errors.push(`${match.id}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, computed, total: upcomingMatches.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("compute-features error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
