import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const SEASON = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;

    // ── Step 1: Aggregate referee stats from completed matches ──
    const { data: refMatches } = await supabase
      .from("matches")
      .select("referee")
      .eq("status", "completed")
      .not("referee", "is", null);

    const refCounts = new Map<string, number>();
    for (const m of refMatches || []) {
      const name = (m.referee || "").trim();
      if (!name) continue;
      refCounts.set(name, (refCounts.get(name) || 0) + 1);
    }

    // Upsert referee records with match counts and league-average estimates
    const refereeUpserts: any[] = [];
    for (const [name, count] of refCounts) {
      if (count >= 2) {
        refereeUpserts.push({
          name,
          matches_officiated: count,
          yellow_avg: 3.5,
          red_avg: 0.15,
          foul_avg: 22,
          penalty_avg: 0.12,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (refereeUpserts.length > 0) {
      const { error } = await supabase.from("referees").upsert(refereeUpserts, { onConflict: "name" });
      if (error) console.error("Referee upsert error:", error);
    }

    // ── Step 2: Compute team discipline using a single batch query ──
    // Get all completed matches with goals
    const { data: completedMatches } = await supabase
      .from("matches")
      .select("goals_home, goals_away, team_home_id, team_away_id")
      .eq("status", "completed")
      .not("goals_home", "is", null)
      .order("match_date", { ascending: false })
      .limit(1000);

    // Aggregate per team
    const teamStats = new Map<string, { totalGoals: number; closeMatches: number; count: number }>();
    for (const m of completedMatches || []) {
      const gh = m.goals_home ?? 0;
      const ga = m.goals_away ?? 0;
      const isClose = Math.abs(gh - ga) <= 1;
      for (const tid of [m.team_home_id, m.team_away_id]) {
        const existing = teamStats.get(tid) || { totalGoals: 0, closeMatches: 0, count: 0 };
        existing.totalGoals += gh + ga;
        if (isClose) existing.closeMatches++;
        existing.count++;
        teamStats.set(tid, existing);
      }
    }

    // Batch upsert discipline records
    const disciplineRows: any[] = [];
    for (const [teamId, stats] of teamStats) {
      if (stats.count < 5) continue;
      const avgGoals = stats.totalGoals / stats.count;
      const compRate = stats.closeMatches / stats.count;
      disciplineRows.push({
        team_id: teamId,
        season: SEASON,
        yellow_avg: Math.round((1.5 + compRate * 0.8) * 100) / 100,
        red_avg: Math.round((0.05 + compRate * 0.05) * 100) / 100,
        foul_avg: Math.round((10 + compRate * 3 + avgGoals * 0.5) * 100) / 100,
        matches_counted: stats.count,
        updated_at: new Date().toISOString(),
      });
    }

    if (disciplineRows.length > 0) {
      // Upsert in chunks of 50
      for (let i = 0; i < disciplineRows.length; i += 50) {
        const chunk = disciplineRows.slice(i, i + 50);
        const { error } = await supabase.from("team_discipline").upsert(chunk, { onConflict: "team_id,season" });
        if (error) console.error("Discipline upsert error:", error);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      referees_updated: refereeUpserts.length,
      teams_updated: disciplineRows.length,
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
