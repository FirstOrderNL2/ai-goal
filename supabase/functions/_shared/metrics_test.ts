// Pure-function unit tests for Phase 3 metrics. Run with: deno test
import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  multiclassLogLoss, brier1x2, rankedProbabilityScore,
  expectedCalibrationError, accuracy1x2, maeGoals,
  type ProbVec3, type Outcome,
} from "./metrics.ts";

const uniform: ProbVec3 = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };

Deno.test("log loss: uniform → ln(3)", () => {
  const ll = multiclassLogLoss([uniform, uniform, uniform], ["home", "draw", "away"]);
  assertAlmostEquals(ll, Math.log(3), 1e-6);
});

Deno.test("log loss: perfect → ~0", () => {
  const ll = multiclassLogLoss(
    [{ home: 1, draw: 0, away: 0 }, { home: 0, draw: 1, away: 0 }],
    ["home", "draw"],
  );
  if (ll > 1e-6) throw new Error(`expected ~0, got ${ll}`);
});

Deno.test("brier: perfect → 0", () => {
  const b = brier1x2(
    [{ home: 1, draw: 0, away: 0 }, { home: 0, draw: 0, away: 1 }],
    ["home", "away"],
  );
  assertAlmostEquals(b, 0, 1e-9);
});

Deno.test("brier: uniform vs home truth = 2/3", () => {
  // (1/3-1)² + (1/3)² + (1/3)² = 4/9+1/9+1/9 = 6/9 = 2/3
  assertAlmostEquals(brier1x2([uniform], ["home"]), 2 / 3, 1e-9);
});

Deno.test("RPS: perfect → 0", () => {
  const r = rankedProbabilityScore(
    [{ home: 1, draw: 0, away: 0 }],
    ["home"],
  );
  assertAlmostEquals(r, 0, 1e-9);
});

Deno.test("ECE: perfectly calibrated single bin", () => {
  // Confidence 1.0, all correct
  const preds: ProbVec3[] = Array(10).fill({ home: 1, draw: 0, away: 0 });
  const actuals: Outcome[] = Array(10).fill("home");
  assertAlmostEquals(expectedCalibrationError(preds, actuals), 0, 1e-9);
});

Deno.test("accuracy: argmax", () => {
  const a = accuracy1x2(
    [{ home: 0.5, draw: 0.3, away: 0.2 }, { home: 0.1, draw: 0.2, away: 0.7 }],
    ["home", "home"],
  );
  assertEquals(a, 0.5);
});

Deno.test("MAE goals", () => {
  const m = maeGoals([{ home: 2, away: 1 }], [{ home: 1, away: 1 }]);
  // |2-1| + |1-1| = 1, divided by 2 → 0.5
  assertEquals(m, 0.5);
});
