// Phase 3 evaluation metrics. Pure functions, framework-free.

export type ProbVec3 = { home: number; draw: number; away: number };
export type Outcome = "home" | "draw" | "away";

const EPS = 1e-12;
const clamp = (p: number) => Math.min(1 - EPS, Math.max(EPS, p));

export function multiclassLogLoss(preds: ProbVec3[], actuals: Outcome[]): number {
  if (!preds.length) return NaN;
  let sum = 0;
  for (let i = 0; i < preds.length; i++) {
    const p = preds[i], a = actuals[i];
    const pa = a === "home" ? p.home : a === "draw" ? p.draw : p.away;
    sum += -Math.log(clamp(pa));
  }
  return sum / preds.length;
}

export function brier1x2(preds: ProbVec3[], actuals: Outcome[]): number {
  if (!preds.length) return NaN;
  let sum = 0;
  for (let i = 0; i < preds.length; i++) {
    const p = preds[i], a = actuals[i];
    const yh = a === "home" ? 1 : 0;
    const yd = a === "draw" ? 1 : 0;
    const ya = a === "away" ? 1 : 0;
    sum += (p.home - yh) ** 2 + (p.draw - yd) ** 2 + (p.away - ya) ** 2;
  }
  return sum / preds.length;
}

/** Ranked Probability Score for ordered classes home < draw < away, normalized to [0,1]. */
export function rankedProbabilityScore(preds: ProbVec3[], actuals: Outcome[]): number {
  if (!preds.length) return NaN;
  let sum = 0;
  for (let i = 0; i < preds.length; i++) {
    const p = preds[i], a = actuals[i];
    const yh = a === "home" ? 1 : 0;
    const yd = a === "draw" ? 1 : 0;
    const c1p = p.home, c1a = yh;
    const c2p = p.home + p.draw, c2a = yh + yd;
    sum += (c1p - c1a) ** 2 + (c2p - c2a) ** 2;
  }
  return sum / preds.length / 2;
}

/** Expected Calibration Error on the favored-class probability, 10 bins. */
export function expectedCalibrationError(preds: ProbVec3[], actuals: Outcome[], bins = 10): number {
  if (!preds.length) return NaN;
  const buckets = Array.from({ length: bins }, () => ({ n: 0, conf: 0, correct: 0 }));
  for (let i = 0; i < preds.length; i++) {
    const p = preds[i];
    const arr: Array<[Outcome, number]> = [["home", p.home], ["draw", p.draw], ["away", p.away]];
    arr.sort((a, b) => b[1] - a[1]);
    const [pred, conf] = arr[0];
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(conf * bins)));
    buckets[idx].n += 1;
    buckets[idx].conf += conf;
    if (pred === actuals[i]) buckets[idx].correct += 1;
  }
  const N = preds.length;
  let ece = 0;
  for (const b of buckets) {
    if (b.n === 0) continue;
    const avgConf = b.conf / b.n;
    const acc = b.correct / b.n;
    ece += (b.n / N) * Math.abs(avgConf - acc);
  }
  return ece;
}

export function maeGoals(
  preds: Array<{ home: number; away: number }>,
  actuals: Array<{ home: number; away: number }>,
): number {
  if (!preds.length) return NaN;
  let sum = 0;
  for (let i = 0; i < preds.length; i++) {
    sum += Math.abs(preds[i].home - actuals[i].home) + Math.abs(preds[i].away - actuals[i].away);
  }
  return sum / (preds.length * 2);
}

export function accuracy1x2(preds: ProbVec3[], actuals: Outcome[]): number {
  if (!preds.length) return NaN;
  let hits = 0;
  for (let i = 0; i < preds.length; i++) {
    const p = preds[i];
    const arr: Array<[Outcome, number]> = [["home", p.home], ["draw", p.draw], ["away", p.away]];
    arr.sort((a, b) => b[1] - a[1]);
    if (arr[0][0] === actuals[i]) hits++;
  }
  return hits / preds.length;
}
