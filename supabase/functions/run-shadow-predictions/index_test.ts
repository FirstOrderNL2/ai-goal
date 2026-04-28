// Smoke test for run-shadow-predictions: rejects anon (admin-guarded).
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("run-shadow-predictions rejects anon callers", async () => {
  if (!SUPABASE_URL || !ANON) {
    console.warn("skip: env not loaded");
    return;
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/run-shadow-predictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: "{}",
  });
  const body = await res.text();
  assert(res.status === 401 || res.status === 403, `expected 401/403 for anon, got ${res.status}: ${body}`);
});
