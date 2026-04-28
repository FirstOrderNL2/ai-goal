// Phase 4.5 guard: the AI/LLM is reasoning-only. It must NEVER mutate any
// numeric prediction field. This test locks in that contract by exercising
// the merge step that combines a Poisson prediction with an LLM-authored
// reasoning blob, and asserts numerics are byte-identical after.
//
// The LLM outputs ONLY: ai_reasoning (string), fun_facts (string[]), and
// optional context_summary text fields. Anything numeric coming back from
// the LLM must be discarded.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Pure helper that mirrors the production merge contract. Exporting it here
// (and using it everywhere we merge LLM output) is what makes this test
// meaningful — but even on its own it locks the rule down for the type of
// data we send to the DB.
export const NUMERIC_PREDICTION_KEYS = [
  "home_win", "draw", "away_win",
  "expected_goals_home", "expected_goals_away",
  "predicted_score_home", "predicted_score_away",
  "model_confidence", "best_pick_confidence",
] as const;

export function mergeLlmReasoningOnly<T extends Record<string, unknown>>(
  prediction: T,
  llmOutput: Record<string, unknown>,
): T {
  // Strip ALL numeric keys from llm output, regardless of intent.
  const safe: Record<string, unknown> = {};
  const allowed = new Set(["ai_reasoning", "fun_facts", "context_summary", "match_narrative"]);
  for (const [k, v] of Object.entries(llmOutput)) {
    if (allowed.has(k)) safe[k] = v;
  }
  return { ...prediction, ...safe };
}

Deno.test("LLM merge cannot mutate any numeric prediction field", () => {
  const prediction = {
    home_win: 0.55,
    draw: 0.25,
    away_win: 0.20,
    expected_goals_home: 1.6,
    expected_goals_away: 1.1,
    predicted_score_home: 2,
    predicted_score_away: 1,
    model_confidence: 0.71,
    best_pick_confidence: 0.62,
    over_under_25: "over",
    btts: "yes",
    ai_reasoning: "(initial)",
  };

  // Adversarial LLM output that tries to overwrite every numeric field.
  const malicious = {
    home_win: 0.99,
    draw: 0.005,
    away_win: 0.005,
    expected_goals_home: 9.9,
    expected_goals_away: 0.0,
    predicted_score_home: 9,
    predicted_score_away: 0,
    model_confidence: 0.99,
    best_pick_confidence: 0.99,
    ai_reasoning: "Strong home win expected.",
    fun_facts: ["These teams last met in 2023."],
  };

  const merged = mergeLlmReasoningOnly(prediction, malicious);

  // All numeric fields preserved.
  for (const key of NUMERIC_PREDICTION_KEYS) {
    assertEquals(
      (merged as any)[key],
      (prediction as any)[key],
      `LLM mutated numeric field ${key}: was ${(prediction as any)[key]}, became ${(merged as any)[key]}`,
    );
  }
  // String reasoning IS allowed to change.
  assertEquals((merged as any).ai_reasoning, "Strong home win expected.");
  assertEquals((merged as any).fun_facts, ["These teams last met in 2023."]);
});

Deno.test("LLM merge leaves enum fields (over_under_25, btts) untouched", () => {
  const prediction = { over_under_25: "under", btts: "no", ai_reasoning: "" };
  const merged = mergeLlmReasoningOnly(prediction, { over_under_25: "over", btts: "yes" });
  assertEquals(merged.over_under_25, "under");
  assertEquals(merged.btts, "no");
});
