// Idempotency + no-state-drift tests for update-online-ratings (Phase 2.5).
// Reads the live edge function and tables. Run: deno test --allow-net --allow-env --allow-read
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/update-online-ratings`;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function invoke(body: Record<string, unknown> = {}) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function snapshotState() {
  const { data, count } = await supabase
    .from("team_rating_state")
    .select("team_id, rating_winloss, attack, defense, matches_counted, last_match_at", { count: "exact" })
    .order("team_id", { ascending: true })
    .limit(2000);
  const map = new Map<string, any>();
  for (const r of data ?? []) map.set(r.team_id, r);
  return { count: count ?? 0, map };
}

async function historyCount() {
  const { count } = await supabase
    .from("team_rating_history")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

Deno.test("update-online-ratings: state matches latest history row", async () => {
  await invoke({ lookback_days: 30, limit: 50 });
  const { map } = await snapshotState();
  // sample one team
  const [, sample] = map.entries().next().value ?? [null, null];
  if (!sample) return; // empty DB; nothing to verify
  const { data: latestHist } = await supabase
    .from("team_rating_history")
    .select("rating_winloss_after")
    .eq("team_id", sample.team_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertEquals(Number(sample.rating_winloss), Number(latestHist?.rating_winloss_after));
});

Deno.test("update-online-ratings: idempotent — no history growth, no state drift on rerun", async () => {
  // First run (warmup, may grow history)
  await invoke({ lookback_days: 30, limit: 50 });
  const before = await snapshotState();
  const beforeHist = await historyCount();

  // Second run with same window
  await invoke({ lookback_days: 30, limit: 50 });
  const after = await snapshotState();
  const afterHist = await historyCount();

  assertEquals(beforeHist, afterHist, "history row count must not grow on identical rerun");
  assertEquals(before.count, after.count, "team_rating_state row count must not change");

  // Per-team: rating_winloss bit-identical, matches_counted unchanged
  for (const [teamId, b] of before.map.entries()) {
    const a = after.map.get(teamId);
    assert(a, `team ${teamId} disappeared from state`);
    assertEquals(Number(a.rating_winloss), Number(b.rating_winloss), `rating drifted for ${teamId}`);
    assertEquals(Number(a.attack), Number(b.attack), `attack drifted for ${teamId}`);
    assertEquals(Number(a.defense), Number(b.defense), `defense drifted for ${teamId}`);
    assertEquals(a.matches_counted, b.matches_counted, `matches_counted drifted for ${teamId}`);
  }
});
