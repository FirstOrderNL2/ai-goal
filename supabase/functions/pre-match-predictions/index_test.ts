// Smoke test for pre-match-predictions: reachable, no 5xx.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("pre-match-predictions is reachable and not 5xx", async () => {
  if (!SUPABASE_URL || !ANON) {
    console.warn("skip: env not loaded");
    return;
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pre-match-predictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify({ dry_run: true }),
  });
  await res.text();
  assert(res.status < 500, `function returned 5xx (${res.status})`);
});
