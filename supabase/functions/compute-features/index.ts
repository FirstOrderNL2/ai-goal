import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get upcoming matches
    const { data: upcomingMatches, error: matchErr } = await supabase
      .from("matches")
      .select("id, team_home_id, team_away_id, league")
      .eq("status", "upcoming")
      .order("match_date", { ascending: true })
      .limit(50);

    if (matchErr) throw matchErr;
    if (!upcomingMatches || upcomingMatches.length === 0) {
      return new Response(JSON.stringify({ success: true, computed: 0, message: "No upcoming matches" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all team IDs involved
    const teamIds = [...new Set(upcomingMatches.flatMap(m => [m.team_home_id, m.team_away_id]))];

    // Get completed matches for form computation
    const { data: completedMatches } = await supabase
      .from("matches")
      .select("team_home_id, team_away_id, goals_home, goals_away, match_date")
      .eq("status", "completed")
      .or(teamIds.map(id => `team_home_id.eq.${id},team_away_id.eq.${id}`).join(","))
      .order("match_date", { ascending: false })
      .limit(1000);

    // Get team statistics
    const { data: teamStats } = await supabase
      .from("team_statistics")
      .select("*")
      .in("team_id", teamIds);

    const statsMap = new Map<string, any>();
    teamStats?.forEach(s => statsMap.set(s.team_id, s));

    // Get leagues for standings positions
    const { data: leagues } = await supabase.from("leagues").select("name, standings_data");

    // Build position lookup from standings_data
    const positionMap = new Map<string, number>(); // team_api_football_id → rank
    // We need team api_football_id mapping
    const { data: teamsData } = await supabase.from("teams").select("id, api_football_id, name").in("id", teamIds);
    const teamApiIdMap = new Map<string, number>(); // uuid → api_football_id
    const teamNameMap = new Map<string, string>(); // uuid → name
    teamsData?.forEach(t => {
      if (t.api_football_id) teamApiIdMap.set(t.id, t.api_football_id);
      teamNameMap.set(t.id, t.name);
    });

    // Parse standings to get positions
    const teamPositionMap = new Map<string, number>(); // team uuid → rank
    leagues?.forEach(league => {
      const standings = league.standings_data as any[];
      if (!Array.isArray(standings)) return;
      // standings is array of groups, each group is array of team standings
      for (const group of standings) {
        if (!Array.isArray(group)) continue;
        for (const entry of group) {
          const apiId = entry?.team?.id;
          if (!apiId) continue;
          // Find uuid for this apiId
          teamsData?.forEach(t => {
            if (t.api_football_id === apiId) {
              teamPositionMap.set(t.id, entry.rank);
            }
          });
        }
      }
    });

    // Compute form for each team
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

    // Compute stats from completed matches
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
        scored += gf;
        conceded += ga;
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

        // Use team_statistics if available, else computed from matches
        const homeAvgScored = homeStats?.avg_goals_scored ?? homeMatchStats?.avgScored ?? 0;
        const homeAvgConceded = homeStats?.avg_goals_conceded ?? homeMatchStats?.avgConceded ?? 0;
        const awayAvgScored = awayStats?.avg_goals_scored ?? awayMatchStats?.avgScored ?? 0;
        const awayAvgConceded = awayStats?.avg_goals_conceded ?? awayMatchStats?.avgConceded ?? 0;

        // Poisson xG
        const leagueAvg = 1.35;
        const hAtk = homeAvgScored > 0 ? homeAvgScored / leagueAvg : 1;
        const aDefW = awayAvgConceded > 0 ? awayAvgConceded / leagueAvg : 1;
        const aAtk = awayAvgScored > 0 ? awayAvgScored / leagueAvg : 1;
        const hDefW = homeAvgConceded > 0 ? homeAvgConceded / leagueAvg : 1;
        const poissonHome = Math.round(hAtk * aDefW * leagueAvg * 100) / 100;
        const poissonAway = Math.round(aAtk * hDefW * leagueAvg * 100) / 100;

        const posHome = teamPositionMap.get(match.team_home_id) ?? null;
        const posAway = teamPositionMap.get(match.team_away_id) ?? null;
        const posDiff = (posHome != null && posAway != null) ? posHome - posAway : null;

        // Get existing h2h_results (may have been populated by sync-football-data)
        const { data: existingFeatures } = await supabase
          .from("match_features")
          .select("h2h_results")
          .eq("match_id", match.id)
          .single();

        const { error } = await supabase.from("match_features").upsert({
          match_id: match.id,
          home_form_last5: homeForm || null,
          away_form_last5: awayForm || null,
          home_avg_scored: Math.round(homeAvgScored * 100) / 100,
          home_avg_conceded: Math.round(homeAvgConceded * 100) / 100,
          away_avg_scored: Math.round(awayAvgScored * 100) / 100,
          away_avg_conceded: Math.round(awayAvgConceded * 100) / 100,
          h2h_results: existingFeatures?.h2h_results ?? null,
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
