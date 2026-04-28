// Phase 3: append-training-example idempotency test.
// Run: deno test --allow-net --allow-env --allow-read
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/append-training-example`;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function invoke() {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ lookback_days: 60, limit: 500 }),
  });
  const json = await res.json();
  await res.text().catch(() => {});
  return json;
}

async function rowCount() {
  const { count } = await supabase
    .from("training_examples")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

Deno.test("append-training-example: idempotent — no duplicates on rerun", async () => {
  await invoke(); // warmup
  const before = await rowCount();
  await invoke();
  const after = await rowCount();
  assertEquals(before, after, "training_examples must not grow on identical rerun");
});

Deno.test("append-training-example: every row has a pre_match prediction_run", async () => {
  const { data: examples } = await supabase
    .from("training_examples")
    .select("prediction_run_id")
    .limit(100);
  if (!examples?.length) return; // empty — fine

  const runIds = examples.map((e: any) => e.prediction_run_id);
  const { data: runs } = await supabase
    .from("prediction_runs")
    .select("id, run_type")
    .in("id", runIds);

  for (const r of runs ?? []) {
    assert((r as any).run_type === "pre_match", `non-pre_match run leaked into training_examples: ${(r as any).id}`);
  }
});
