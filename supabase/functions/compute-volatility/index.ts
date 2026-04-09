import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://v3.football.api-sports.io";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("API_FOOTBALL_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const SEASON = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;

    // ── Step 1: Aggregate referee stats from completed matches with referee names ──
    const { data: refMatches } = await supabase
      .from("matches")
      .select("referee")
      .eq("status", "completed")
      .not("referee", "is", null)
      .not("referee", "eq", "");

    // Count matches per referee
    const refCounts = new Map<string, number>();
    for (const m of refMatches || []) {
      const name = (m.referee || "").trim();
      if (!name) continue;
      refCounts.set(name, (refCounts.get(name) || 0) + 1);
    }

    // ── Step 2: For referees with enough matches, try to fetch card stats from API ──
    // We'll use fixture statistics for completed matches to get card data
    // But since we can't fetch per-referee stats from API-Football free tier,
    // we'll estimate from league averages and available data

    // For now, upsert referee records with match counts
    // Card averages will be populated when we have fixture events data
    const refereeUpserts: any[] = [];
    for (const [name, count] of refCounts) {
      if (count >= 2) {
        refereeUpserts.push({
          name,
          matches_officiated: count,
          // Default estimates based on league averages (will be refined with actual data)
          yellow_avg: 3.5, // league average ~3.5 yellows per match
          red_avg: 0.15,   // league average ~0.15 reds per match
          foul_avg: 22,     // league average ~22 fouls per match
          penalty_avg: 0.12, // league average
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (refereeUpserts.length > 0) {
      const { error } = await supabase
        .from("referees")
        .upsert(refereeUpserts, { onConflict: "name" });
      if (error) console.error("Referee upsert error:", error);
    }

    // ── Step 3: Compute team discipline from completed matches ──
    // Get all teams
    const { data: teams } = await supabase.from("teams").select("id, name, api_football_id");

    let disciplineCount = 0;

    // For each team, compute discipline stats from their match history
    // We estimate card rates from goal/foul patterns in completed matches
    for (const team of teams || []) {
      const { data: teamMatches } = await supabase
        .from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .or(`team_home_id.eq.${team.id},team_away_id.eq.${team.id}`)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(20);

      if (!teamMatches || teamMatches.length < 5) continue;

      // Estimate discipline from match patterns
      // Higher-scoring, more competitive matches tend to have more cards
      let totalGoals = 0;
      let closerMatches = 0; // matches decided by 1 goal or draws

      for (const m of teamMatches) {
        const gh = m.goals_home ?? 0;
        const ga = m.goals_away ?? 0;
        totalGoals += gh + ga;
        if (Math.abs(gh - ga) <= 1) closerMatches++;
      }

      const avgGoalsPerMatch = totalGoals / teamMatches.length;
      const competitivenessRate = closerMatches / teamMatches.length;

      // Estimate yellow cards: teams in competitive matches get more cards
      // Base: 1.5 yellows/team/match, adjust by competitiveness
      const yellowAvg = Math.round((1.5 + competitivenessRate * 0.8) * 100) / 100;
      const redAvg = Math.round((0.05 + competitivenessRate * 0.05) * 100) / 100;
      const foulAvg = Math.round((10 + competitivenessRate * 3 + avgGoalsPerMatch * 0.5) * 100) / 100;

      const { error } = await supabase.from("team_discipline").upsert({
        team_id: team.id,
        season: SEASON,
        yellow_avg: yellowAvg,
        red_avg: redAvg,
        foul_avg: foulAvg,
        matches_counted: teamMatches.length,
        updated_at: new Date().toISOString(),
      }, { onConflict: "team_id,season" });

      if (!error) disciplineCount++;
    }

    // ── Step 4: Try to fetch actual fixture events for card data (if API available) ──
    // This section fetches real card data from recent fixtures to refine estimates
    if (apiKey) {
      try {
        // Get recent completed matches with API IDs that have referees
        const { data: recentWithRef } = await supabase
          .from("matches")
          .select("api_football_id, referee, team_home_id, team_away_id")
          .eq("status", "completed")
          .not("referee", "is", null)
          .not("api_football_id", "is", null)
          .order("match_date", { ascending: false })
          .limit(50);

        // Fetch events for a sample of matches to get real card data
        const refCardData = new Map<string, { yellows: number[]; reds: number[] }>();
        const teamCardData = new Map<string, { yellows: number[]; reds: number[] }>();
        let apiCalls = 0;

        for (const m of (recentWithRef || []).slice(0, 10)) {
          if (apiCalls >= 10) break; // limit API calls
          try {
            const res = await fetch(`${API_BASE}/fixtures/events?fixture=${m.api_football_id}`, {
              headers: { "x-apisports-key": apiKey },
            });
            if (!res.ok) continue;
            apiCalls++;

            const json = await res.json();
            const events = json.response || [];

            let homeYellows = 0, homeReds = 0, awayYellows = 0, awayReds = 0;
            for (const evt of events) {
              if (evt.type === "Card") {
                if (evt.detail === "Yellow Card") {
                  if (evt.team?.id && teamCardData.has(m.team_home_id)) homeYellows++;
                  else awayYellows++;
                } else if (evt.detail === "Red Card" || evt.detail === "Second Yellow card") {
                  if (evt.team?.id && teamCardData.has(m.team_home_id)) homeReds++;
                  else awayReds++;
                }
              }
            }

            const totalYellows = homeYellows + awayYellows;
            const totalReds = homeReds + awayReds;

            // Track per referee
            if (m.referee) {
              if (!refCardData.has(m.referee)) refCardData.set(m.referee, { yellows: [], reds: [] });
              refCardData.get(m.referee)!.yellows.push(totalYellows);
              refCardData.get(m.referee)!.reds.push(totalReds);
            }

            // Delay to respect rate limits
            await new Promise(r => setTimeout(r, 1200));
          } catch (e) {
            console.error(`Error fetching events for fixture ${m.api_football_id}:`, e);
          }
        }

        // Update referees with actual card data
        for (const [name, data] of refCardData) {
          if (data.yellows.length >= 2) {
            const yAvg = data.yellows.reduce((a, b) => a + b, 0) / data.yellows.length;
            const rAvg = data.reds.reduce((a, b) => a + b, 0) / data.reds.length;
            await supabase.from("referees")
              .update({
                yellow_avg: Math.round(yAvg * 100) / 100,
                red_avg: Math.round(rAvg * 100) / 100,
                updated_at: new Date().toISOString(),
              })
              .eq("name", name);
          }
        }
      } catch (e) {
        console.error("Error fetching card events:", e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      referees_updated: refereeUpserts.length,
      teams_updated: disciplineCount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Compute volatility error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
