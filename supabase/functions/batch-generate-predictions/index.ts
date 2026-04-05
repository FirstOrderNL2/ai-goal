import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchMatchContextForBatch(
  homeName: string, awayName: string, league: string, matchDate: string,
  matchId: string, supabaseUrl: string, serviceKey: string
): Promise<string> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/fetch-match-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        home_team: homeName,
        away_team: awayName,
        league,
        match_date: matchDate,
        match_id: matchId,
      }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data.context || "";
  } catch (e) {
    console.error(`Context fetch failed for ${homeName} vs ${awayName}:`, e);
    return "";
  }
}

// ── Poisson helpers (same as main engine) ──
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

function computeStatisticalAnchors(
  homeStats: { avgScored: string; avgConceded: string } | null,
  awayStats: { avgScored: string; avgConceded: string } | null,
  odds: any | null
) {
  const result: any = {};
  if (homeStats && awayStats) {
    const leagueAvg = 1.35;
    const hAtk = parseFloat(homeStats.avgScored) / leagueAvg;
    const aDefW = parseFloat(awayStats.avgConceded) / leagueAvg;
    const aAtk = parseFloat(awayStats.avgScored) / leagueAvg;
    const hDefW = parseFloat(homeStats.avgConceded) / leagueAvg;

    result.poisson_xg_home = Math.round(hAtk * aDefW * leagueAvg * 100) / 100;
    result.poisson_xg_away = Math.round(aAtk * hDefW * leagueAvg * 100) / 100;

    let hw = 0, dr = 0, aw = 0, o25 = 0;
    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        const p = poissonPMF(result.poisson_xg_home, h) * poissonPMF(result.poisson_xg_away, a);
        if (h > a) hw += p; else if (h === a) dr += p; else aw += p;
        if (h + a > 2) o25 += p;
      }
    }
    result.poisson_home_win = Math.round(hw * 1000) / 1000;
    result.poisson_draw = Math.round(dr * 1000) / 1000;
    result.poisson_away_win = Math.round(aw * 1000) / 1000;
    result.poisson_over_25 = Math.round(o25 * 1000) / 1000;

    const hScore = parseFloat(homeStats.avgScored);
    const aScore = parseFloat(awayStats.avgScored);
    result.poisson_btts = Math.round((1 - poissonPMF(hScore, 0)) * (1 - poissonPMF(aScore, 0)) * 1000) / 1000;
  }
  if (odds) {
    const h = 1 / odds.home_win_odds, d = 1 / odds.draw_odds, a = 1 / odds.away_win_odds;
    const t = h + d + a;
    result.implied_home_win = Math.round((h / t) * 1000) / 1000;
    result.implied_draw = Math.round((d / t) * 1000) / 1000;
    result.implied_away_win = Math.round((a / t) * 1000) / 1000;
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const limit = body.limit ?? 10;
    const mode = body.mode ?? "upcoming";

    if (mode === "review") {
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not set");
      return await generateReviews(supabase, supabaseUrl, serviceKey, lovableApiKey, limit);
    }

    // Get upcoming matches without predictions
    const { data: matches, error: matchErr } = await supabase
      .from("matches")
      .select("id, league, match_date, team_home_id, team_away_id, home_team:teams!matches_team_home_id_fkey(name), away_team:teams!matches_team_away_id_fkey(name)")
      .eq("status", "upcoming")
      .order("match_date", { ascending: true })
      .limit(50);

    if (matchErr) throw matchErr;
    if (!matches || matches.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No upcoming matches", generated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing predictions
    const matchIds = matches.map((m: any) => m.id);
    const { data: existingPreds } = await supabase
      .from("predictions")
      .select("match_id")
      .in("match_id", matchIds);

    const existingSet = new Set((existingPreds || []).map((p: any) => p.match_id));
    const needsPrediction = matches.filter((m: any) => !existingSet.has(m.id)).slice(0, limit);

    if (needsPrediction.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "All upcoming matches have predictions", generated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let generated = 0;
    const errors: string[] = [];

    // Use statistical prediction engine (NO AI calls) for batch processing
    for (const match of needsPrediction) {
      const homeName = (match as any).home_team?.name ?? "Home";
      const awayName = (match as any).away_team?.name ?? "Away";

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/generate-statistical-prediction`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ match_id: match.id }),
        });

        if (res.ok) {
          generated++;
        } else {
          const status = res.status;
          await res.text();
          errors.push(`Statistical prediction error ${status} for ${homeName} vs ${awayName}`);
        }

        // Small delay to avoid overwhelming the DB
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        errors.push(`Error for ${homeName} vs ${awayName}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, generated, total: needsPrediction.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("batch-generate-predictions error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function generateReviews(supabase: any, supabaseUrl: string, serviceKey: string, lovableApiKey: string, limit: number) {
  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "completed")
    .is("ai_post_match_review", null)
    .not("goals_home", "is", null)
    .order("match_date", { ascending: false })
    .limit(limit);

  if (!matches || matches.length === 0) {
    return new Response(JSON.stringify({ success: true, message: "No matches need reviews", reviewed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let reviewed = 0;
  const errors: string[] = [];

  for (const match of matches) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-post-match-review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ match_id: match.id }),
      });
      if (res.ok) reviewed++;
      else errors.push(`Review failed for ${match.id}: ${res.status}`);
      await res.text();
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      errors.push(`Review error: ${e.message}`);
    }
  }

  return new Response(JSON.stringify({ success: true, reviewed, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
