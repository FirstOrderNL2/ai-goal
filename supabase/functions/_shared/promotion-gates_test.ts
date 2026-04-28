import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { evaluateGates } from "./promotion-gates.ts";

const baseMetrics = { log_loss: 1.0, brier: 0.5, rps: 0.3, ece: 0.05, mae_goals: 1.0 };

Deno.test("gates: no champion still requires volume", () => {
  const r = evaluateGates({
    n_holdout: 50,
    overall_challenger: baseMetrics,
    overall_champion: null,
    recent_challenger: { log_loss: 1.0, brier: 0.5 },
    recent_champion: null,
    per_league: [],
  });
  assertEquals(r.passes, false);
  assertEquals(r.reasons[0], "insufficient_volume:50<200");
});

Deno.test("gates: clearly better challenger passes", () => {
  const r = evaluateGates({
    n_holdout: 300,
    overall_challenger: { log_loss: 0.9, brier: 0.45, rps: 0.27, ece: 0.04, mae_goals: 0.9 },
    overall_champion: baseMetrics,
    recent_challenger: { log_loss: 0.85, brier: 0.42 },
    recent_champion: { log_loss: 0.95, brier: 0.48 },
    per_league: [{ league: "EPL", n: 50, challenger: { log_loss: 0.9 }, champion: { log_loss: 1.0 } }],
  });
  assertEquals(r.passes, true);
  assertEquals(r.reasons, []);
});

Deno.test("gates: league collapse blocks promotion", () => {
  const r = evaluateGates({
    n_holdout: 300,
    overall_challenger: { log_loss: 0.9, brier: 0.45, rps: 0.27, ece: 0.04, mae_goals: 0.9 },
    overall_champion: baseMetrics,
    recent_challenger: { log_loss: 0.85, brier: 0.42 },
    recent_champion: { log_loss: 0.95, brier: 0.48 },
    per_league: [
      { league: "EPL", n: 50, challenger: { log_loss: 0.9 }, champion: { log_loss: 1.0 } },
      { league: "LaLiga", n: 40, challenger: { log_loss: 1.2 }, champion: { log_loss: 1.0 } },
    ],
  });
  assertEquals(r.passes, false);
  assertEquals(r.reasons.some((x) => x.startsWith("league_collapse:LaLiga")), true);
});

Deno.test("gates: ECE drift blocks", () => {
  const r = evaluateGates({
    n_holdout: 300,
    overall_challenger: { log_loss: 0.9, brier: 0.45, rps: 0.27, ece: 0.08, mae_goals: 0.9 },
    overall_champion: baseMetrics,
    recent_challenger: { log_loss: 0.85, brier: 0.42 },
    recent_champion: { log_loss: 0.95, brier: 0.48 },
    per_league: [],
  });
  assertEquals(r.passes, false);
  assertEquals(r.reasons.some((x) => x.startsWith("ece_drift")), true);
});
