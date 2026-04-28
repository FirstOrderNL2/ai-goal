// Phase 4: hard promotion gates. Pure functions. No I/O.
//
// A challenger artifact is promotable iff ALL of these are true:
//   1. minimum holdout volume met
//   2. challenger beats champion overall on log_loss, brier, rps, mae_goals
//      and ECE is not materially worse (delta <= 0.01)
//   3. challenger beats champion on the most recent holdout slice
//      on log_loss AND brier
//   4. for each top-N league with >= 30 examples, challenger log_loss is not
//      more than 5% worse than champion (no major-league collapse)

export type Metrics = {
  log_loss: number;
  brier: number;
  rps: number;
  ece: number;
  mae_goals: number;
};

export type LeagueMetric = {
  league: string;
  n: number;
  challenger: { log_loss: number };
  champion: { log_loss: number };
};

export type GateInput = {
  n_holdout: number;
  overall_challenger: Metrics;
  overall_champion: Metrics | null; // null = no champion yet
  recent_challenger: { log_loss: number; brier: number };
  recent_champion: { log_loss: number; brier: number } | null;
  per_league: LeagueMetric[];
  min_holdout?: number; // default 200
  ece_tolerance?: number; // default 0.01
  league_collapse_threshold?: number; // default 0.05 = 5%
};

export type GateResult = {
  passes: boolean;
  reasons: string[];
};

export function evaluateGates(input: GateInput): GateResult {
  const reasons: string[] = [];
  const minHoldout = input.min_holdout ?? 200;
  const eceTol = input.ece_tolerance ?? 0.01;
  const collapse = input.league_collapse_threshold ?? 0.05;

  // 1. Volume
  if (input.n_holdout < minHoldout) {
    reasons.push(`insufficient_volume:${input.n_holdout}<${minHoldout}`);
  }

  // 2. Overall — only meaningful if there is a champion
  if (input.overall_champion) {
    const c = input.overall_challenger;
    const ch = input.overall_champion;
    if (!(c.log_loss < ch.log_loss)) reasons.push(`overall_log_loss_not_better:${c.log_loss.toFixed(4)}>=${ch.log_loss.toFixed(4)}`);
    if (!(c.brier < ch.brier)) reasons.push(`overall_brier_not_better:${c.brier.toFixed(4)}>=${ch.brier.toFixed(4)}`);
    if (!(c.rps < ch.rps)) reasons.push(`overall_rps_not_better:${c.rps.toFixed(4)}>=${ch.rps.toFixed(4)}`);
    if (!(c.mae_goals <= ch.mae_goals)) reasons.push(`overall_mae_goals_worse:${c.mae_goals.toFixed(4)}>${ch.mae_goals.toFixed(4)}`);
    if (c.ece - ch.ece > eceTol) reasons.push(`ece_drift:${(c.ece - ch.ece).toFixed(4)}>${eceTol}`);
  }

  // 3. Recent holdout
  if (input.recent_champion) {
    const c = input.recent_challenger;
    const ch = input.recent_champion;
    if (!(c.log_loss < ch.log_loss)) reasons.push(`recent_log_loss_not_better:${c.log_loss.toFixed(4)}>=${ch.log_loss.toFixed(4)}`);
    if (!(c.brier < ch.brier)) reasons.push(`recent_brier_not_better:${c.brier.toFixed(4)}>=${ch.brier.toFixed(4)}`);
  }

  // 4. Major-league collapse
  for (const lg of input.per_league) {
    if (lg.n < 30) continue;
    const champLL = lg.champion.log_loss;
    if (champLL <= 0) continue;
    const relWorse = (lg.challenger.log_loss - champLL) / champLL;
    if (relWorse > collapse) {
      reasons.push(`league_collapse:${lg.league}:+${(relWorse * 100).toFixed(1)}%`);
    }
  }

  return { passes: reasons.length === 0, reasons };
}
