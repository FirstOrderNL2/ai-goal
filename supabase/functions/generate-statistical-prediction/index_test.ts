// Smoke test: generate-statistical-prediction parses + responds.
// Doesn't need a real match — calls with a no-op payload and asserts the
// function is up (i.e. doesn't 500 with a syntax error like the matchDateIso
// regression). Accepts any 2xx/4xx status; only 5xx counts as failure.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("generate-statistical-prediction is reachable and not 5xx", async () => {
  if (!SUPABASE_URL || !ANON) {
    console.warn("skip: env not loaded");
    return;
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-statistical-prediction`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify({ ping: true }),
  });
  await res.text();
  assert(res.status < 500, `function returned 5xx (${res.status}) — likely a parse/runtime error`);
});
