// Phase 3 dataset builder. STRICT point-in-time:
//  - only `prediction_runs.run_type = 'pre_match'` rows are considered
//  - features and ratings are read AS OF `prediction_cutoff_ts` (never future)
//  - every row joined to a finalized `match_labels` row

import { getRatingsAsOf } from "./ratings.ts";

export type DatasetRow = {
  prediction_run_id: string;
  match_id: string;
  prediction_cutoff_ts: string;
  league: string | null;
  feature_snapshot: {
    poisson_home: number;
    poisson_draw: number;
    poisson_away: number;
    xg_home: number;
    xg_away: number;
    elo_home: number;
    elo_away: number;
    elo_gap: number;
    atk_home: number;
    def_home: number;
    atk_away: number;
    def_away: number;
  };
  label_snapshot: {
    outcome: "home" | "draw" | "away";
    goals_home: number;
    goals_away: number;
    btts: boolean;
    over_25: boolean;
  };
};

export type BuildOpts = {
  cutoffStart?: string;
  cutoffEnd?: string;
  limit?: number;
  excludeRunIds?: Set<string>;
};

export async function buildPointInTimeDataset(
  supabase: any,
  opts: BuildOpts = {},
): Promise<DatasetRow[]> {
  let q = supabase
    .from("prediction_runs")
    .select("id, match_id, run_type, prediction_cutoff_ts, probabilities, expected_goals, feature_snapshot")
    .eq("run_type", "pre_match"); // CONFIRMATION 2: pre-match only, hard filter

  if (opts.cutoffStart) q = q.gte("prediction_cutoff_ts", opts.cutoffStart);
  if (opts.cutoffEnd) q = q.lte("prediction_cutoff_ts", opts.cutoffEnd);
  q = q.order("prediction_cutoff_ts", { ascending: true }).limit(opts.limit ?? 5000);

  const { data: runs, error } = await q;
  if (error) throw error;
  const runRows = (runs ?? []) as any[];
  if (!runRows.length) return [];

  // Manual join to matches (no FK declared, so PostgREST embed is unavailable)
  const matchIds = Array.from(new Set(runRows.map((r) => r.match_id)));
  const { data: matches } = await supabase
    .from("matches")
    .select("id, league, team_home_id, team_away_id, match_date")
    .in("id", matchIds);
  const matchById = new Map<string, any>();
  for (const m of (matches ?? []) as any[]) matchById.set(m.id, m);

  // Join to labels
  const { data: labels } = await supabase
    .from("match_labels")
    .select("match_id, outcome, goals_home, goals_away, btts, over_25")
    .in("match_id", matchIds);
  const labelByMatch = new Map<string, any>();
  for (const l of (labels ?? []) as any[]) labelByMatch.set(l.match_id, l);

  // Collect all team IDs we need ratings for
  const teamIds = new Set<string>();
  for (const r of runRows) {
    const m = matchById.get(r.match_id);
    if (!m) continue;
    teamIds.add(m.team_home_id);
    teamIds.add(m.team_away_id);
  }

  const out: DatasetRow[] = [];
  for (const r of runRows) {
    if (opts.excludeRunIds?.has(r.id)) continue;
    const m = matchById.get(r.match_id);
    if (!m) continue;
    const lbl = labelByMatch.get(r.match_id);
    if (!lbl) continue;

    // Defensive guard: cutoff must be <= match kickoff
    if (r.prediction_cutoff_ts > m.match_date) {
      console.warn(`[dataset] skipping run ${r.id}: cutoff after kickoff`);
      continue;
    }

    const ratings = await getRatingsAsOf(
      supabase,
      [m.team_home_id, m.team_away_id],
      r.prediction_cutoff_ts,
    );
    const home = ratings.get(m.team_home_id)!;
    const away = ratings.get(m.team_away_id)!;

    const probs = r.probabilities ?? {};
    const xg = r.expected_goals ?? {};
    const fs = r.feature_snapshot ?? {};

    out.push({
      prediction_run_id: r.id,
      match_id: r.match_id,
      prediction_cutoff_ts: r.prediction_cutoff_ts,
      league: m.league ?? null,
      feature_snapshot: {
        poisson_home: Number(probs.home_win ?? probs.home ?? 1 / 3),
        poisson_draw: Number(probs.draw ?? 1 / 3),
        poisson_away: Number(probs.away_win ?? probs.away ?? 1 / 3),
        xg_home: Number(xg.home ?? fs.poisson_xg_home ?? 1.4),
        xg_away: Number(xg.away ?? fs.poisson_xg_away ?? 1.1),
        elo_home: home.rating_winloss,
        elo_away: away.rating_winloss,
        elo_gap: home.rating_winloss - away.rating_winloss,
        atk_home: home.attack,
        def_home: home.defense,
        atk_away: away.attack,
        def_away: away.defense,
      },
      label_snapshot: {
        outcome: lbl.outcome,
        goals_home: lbl.goals_home,
        goals_away: lbl.goals_away,
        btts: !!lbl.btts,
        over_25: !!lbl.over_25,
      },
    });
  }

  return out;
}
