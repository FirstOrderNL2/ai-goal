// Phase 2.5 shared helpers: team rating reads + Elo math.
// `team_rating_state` is the latest-per-team serving table (fast path).
// For point-in-time reads (training, replay), pass `asOfIso` and we read from
// `team_rating_history` so future matches can never leak in.

export type TeamRating = {
  team_id: string;
  rating_winloss: number;
  attack: number;
  defense: number;
  matches_counted: number;
  last_match_at: string | null;
};

export const DEFAULT_RATING: Omit<TeamRating, "team_id"> = {
  rating_winloss: 1500,
  attack: 1.0,
  defense: 1.0,
  matches_counted: 0,
  last_match_at: null,
};

export async function getCurrentRatings(
  supabase: any,
  teamIds: string[],
): Promise<Map<string, TeamRating>> {
  const out = new Map<string, TeamRating>();
  if (!teamIds.length) return out;
  const { data } = await supabase
    .from("team_rating_state")
    .select("team_id, rating_winloss, attack, defense, matches_counted, last_match_at")
    .in("team_id", teamIds);
  for (const row of (data ?? []) as any[]) {
    out.set(row.team_id, {
      team_id: row.team_id,
      rating_winloss: Number(row.rating_winloss),
      attack: Number(row.attack),
      defense: Number(row.defense),
      matches_counted: Number(row.matches_counted ?? 0),
      last_match_at: row.last_match_at ?? null,
    });
  }
  for (const id of teamIds) {
    if (!out.has(id)) out.set(id, { team_id: id, ...DEFAULT_RATING });
  }
  return out;
}

/**
 * Point-in-time rating read. Returns the latest history row strictly before
 * `asOfIso` for each team. Used by the dataset builder so a future match's
 * rating can never become a feature for a past prediction.
 */
export async function getRatingsAsOf(
  supabase: any,
  teamIds: string[],
  asOfIso: string,
): Promise<Map<string, TeamRating>> {
  const out = new Map<string, TeamRating>();
  if (!teamIds.length) return out;
  const { data } = await supabase
    .from("team_rating_history")
    .select("team_id, rating_winloss_after, attack_after, defense_after, updated_at")
    .in("team_id", teamIds)
    .lt("updated_at", asOfIso)
    .order("updated_at", { ascending: false })
    .limit(2000);
  for (const row of (data ?? []) as any[]) {
    if (out.has(row.team_id)) continue;
    out.set(row.team_id, {
      team_id: row.team_id,
      rating_winloss: Number(row.rating_winloss_after),
      attack: Number(row.attack_after),
      defense: Number(row.defense_after),
      matches_counted: 0,
      last_match_at: row.updated_at,
    });
  }
  for (const id of teamIds) {
    if (!out.has(id)) out.set(id, { team_id: id, ...DEFAULT_RATING });
  }
  return out;
}

export function eloProbabilities(homeElo: number, awayElo: number, homeAdv = 60) {
  const expHome = 1 / (1 + Math.pow(10, (awayElo - (homeElo + homeAdv)) / 400));
  const gap = Math.abs(homeElo + homeAdv - awayElo);
  const drawProb = Math.max(0.08, 0.30 - gap / 2200);
  const remaining = 1 - drawProb;
  return {
    home_win: remaining * expHome,
    draw: drawProb,
    away_win: remaining * (1 - expHome),
  };
}

export function ratingExpectedGoals(
  homeAttack: number,
  homeDefense: number,
  awayAttack: number,
  awayDefense: number,
  baseline = 1.4,
  homeBoost = 1.10,
) {
  return {
    lambdaHome: Math.max(0.2, baseline * homeAttack * awayDefense * homeBoost),
    lambdaAway: Math.max(0.2, baseline * awayAttack * homeDefense / homeBoost),
  };
}
