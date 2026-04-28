// Phase 2: Online team-strength learning.
// For each newly-completed match without ratings yet, compute Elo + attack/defense updates
// and append to team_rating_history. Idempotent per (team_id, match_id).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INITIAL_ELO = 1500;
const INITIAL_ATK = 1.0;
const INITIAL_DEF = 1.0;
const K = 20;             // Elo K-factor
const HOME_ADV = 60;      // Elo points for home advantage
const ATK_LR = 0.05;      // attack/defense learning rate
const ATK_DECAY = 0.001;  // pull-to-mean per update

async function getLatestRating(
  supabase: any,
  teamId: string,
): Promise<{ elo: number; atk: number; def: number }> {
  const { data } = await supabase
    .from("team_rating_history")
    .select("rating_winloss_after, attack_after, defense_after")
    .eq("team_id", teamId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    elo: Number(data?.rating_winloss_after ?? INITIAL_ELO),
    atk: Number(data?.attack_after ?? INITIAL_ATK),
    def: Number(data?.defense_after ?? INITIAL_DEF),
  };
}

function eloUpdate(homeElo: number, awayElo: number, gh: number, ga: number) {
  const expHome = 1 / (1 + Math.pow(10, ((awayElo - (homeElo + HOME_ADV)) / 400)));
  const expAway = 1 - expHome;
  const scoreHome = gh > ga ? 1 : gh === ga ? 0.5 : 0;
  const scoreAway = 1 - scoreHome;
  // Margin-of-victory multiplier (Elo for football)
  const diff = Math.abs(gh - ga);
  const mov = diff === 0 ? 1 : diff === 1 ? 1 : diff === 2 ? 1.5 : (11 + diff) / 8;
  return {
    homeAfter: homeElo + K * mov * (scoreHome - expHome),
    awayAfter: awayElo + K * mov * (scoreAway - expAway),
  };
}

function strengthUpdate(
  attackBefore: number,
  defenseBefore: number,
  goalsFor: number,
  goalsAgainst: number,
  oppDefense: number,
  oppAttack: number,
) {
  // Expected goals under multiplicative model: lambda = attack * oppDefense
  const expectedFor = Math.max(0.2, attackBefore * oppDefense);
  const expectedAgainst = Math.max(0.2, oppAttack * defenseBefore);
  const atkSignal = (goalsFor - expectedFor) / Math.max(1, expectedFor);
  const defSignal = (goalsAgainst - expectedAgainst) / Math.max(1, expectedAgainst);
  let atkAfter = attackBefore * (1 + ATK_LR * atkSignal);
  // For defense, conceding more than expected => defense rating goes UP (worse). Lower is better.
  let defAfter = defenseBefore * (1 + ATK_LR * defSignal);
  // Pull-to-mean
  atkAfter = atkAfter + ATK_DECAY * (1 - atkAfter);
  defAfter = defAfter + ATK_DECAY * (1 - defAfter);
  // Clamp
  atkAfter = Math.min(2.5, Math.max(0.4, atkAfter));
  defAfter = Math.min(2.5, Math.max(0.4, defAfter));
  return { atkAfter, defAfter };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const lookbackDays = Number(body.lookback_days ?? 30);
  const limit = Number(body.limit ?? 200);

  // Find completed matches in window that don't yet have rating rows
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: completed, error } = await supabase
    .from("matches")
    .select("id, league, team_home_id, team_away_id, goals_home, goals_away, match_date")
    .eq("status", "completed")
    .gte("match_date", since)
    .not("goals_home", "is", null)
    .not("goals_away", "is", null)
    .order("match_date", { ascending: true })
    .limit(limit * 4); // overscan, we filter

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!completed?.length) {
    return new Response(JSON.stringify({ success: true, processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ids = completed.map((m: any) => m.id);
  const { data: existing } = await supabase
    .from("team_rating_history")
    .select("match_id")
    .in("match_id", ids);
  const done = new Set((existing ?? []).map((r: any) => r.match_id));

  const todo = completed.filter((m: any) => !done.has(m.id)).slice(0, limit);
  let processed = 0;
  const errors: string[] = [];

  for (const m of todo) {
    try {
      const home = await getLatestRating(supabase, m.team_home_id);
      const away = await getLatestRating(supabase, m.team_away_id);

      const { homeAfter, awayAfter } = eloUpdate(home.elo, away.elo, m.goals_home, m.goals_away);
      const homeStr = strengthUpdate(home.atk, home.def, m.goals_home, m.goals_away, away.def, away.atk);
      const awayStr = strengthUpdate(away.atk, away.def, m.goals_away, m.goals_home, home.def, home.atk);

      const rows = [
        {
          team_id: m.team_home_id,
          match_id: m.id,
          league: m.league,
          rating_winloss_before: home.elo,
          rating_winloss_after: homeAfter,
          attack_before: home.atk,
          attack_after: homeStr.atkAfter,
          defense_before: home.def,
          defense_after: homeStr.defAfter,
          home_adv_context: HOME_ADV,
          is_home: true,
          goals_for: m.goals_home,
          goals_against: m.goals_away,
          k_factor: K,
          updated_at: m.match_date,
        },
        {
          team_id: m.team_away_id,
          match_id: m.id,
          league: m.league,
          rating_winloss_before: away.elo,
          rating_winloss_after: awayAfter,
          attack_before: away.atk,
          attack_after: awayStr.atkAfter,
          defense_before: away.def,
          defense_after: awayStr.defAfter,
          home_adv_context: HOME_ADV,
          is_home: false,
          goals_for: m.goals_away,
          goals_against: m.goals_home,
          k_factor: K,
          updated_at: m.match_date,
        },
      ];

      const { error: insErr } = await supabase
        .from("team_rating_history")
        .upsert(rows, { onConflict: "team_id,match_id", ignoreDuplicates: true });

      if (insErr) errors.push(`${m.id}: ${insErr.message}`);
      else processed++;
    } catch (e) {
      errors.push(`${m.id}: ${(e as Error).message}`);
    }
  }

  return new Response(JSON.stringify({
    success: errors.length === 0,
    processed,
    candidates: todo.length,
    errors: errors.slice(0, 10),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
