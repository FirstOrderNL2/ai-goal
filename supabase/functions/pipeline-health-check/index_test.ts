// Smoke test: pipeline-health-check should run without throwing and return
// a JSON shape with `ok: true` and a `counters` block. Uses anon key against
// the deployed function.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("pipeline-health-check returns ok with counters block", async () => {
  if (!SUPABASE_URL || !ANON) {
    console.warn("skip: env not loaded");
    return;
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pipeline-health-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: "{}",
  });
  const text = await res.text();
  assertEquals(res.status, 200, `status=${res.status} body=${text}`);
  const json = JSON.parse(text);
  assert(json.ok === true, "ok should be true");
  assert(typeof json.counters === "object", "should expose counters");
  assert("pre_match_runs_24h" in json.counters, "should include pre_match_runs_24h");
});
