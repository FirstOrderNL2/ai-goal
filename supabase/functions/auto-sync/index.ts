import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Determine mode: "full" for comprehensive daily sync, "quick" for frequent updates
  let mode = "quick";
  try {
    const body = await req.json();
    mode = body.mode ?? "quick";
  } catch { /* default quick */ }

  const log: string[] = [];
  const errors: string[] = [];

  async function callFunction(name: string, body: Record<string, unknown> = {}) {
    const start = Date.now();
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      const ms = Date.now() - start;
      if (!res.ok) {
        errors.push(`${name}: HTTP ${res.status} (${ms}ms)`);
      } else {
        log.push(`${name}: OK (${ms}ms) ${JSON.stringify(data).slice(0, 200)}`);
      }
      return data;
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
      return null;
    }
  }

  // Step 1: Sync API-Football data with mode parameter
  await callFunction("sync-football-data", { mode });

  // Step 2: Sync Sportradar data (secondary — live scores, odds)
  await callFunction("sync-sportradar-data");

  // Step 3: Scrape matches (quick mode skips this)
  if (mode === "full") {
    await callFunction("scrape-matches");
    await callFunction("scrape-news");
  }

  // Step 4: Mark stale "upcoming" and "live" matches as completed (3h buffer)
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { data: staleUpcoming, error: staleUpErr } = await supabase
    .from("matches")
    .update({ status: "completed" })
    .eq("status", "upcoming")
    .lt("match_date", cutoff)
    .select("id");

  if (staleUpErr) {
    errors.push(`cleanup-upcoming: ${staleUpErr.message}`);
  } else if (staleUpcoming?.length) {
    log.push(`cleanup: marked ${staleUpcoming.length} stale upcoming as completed`);
  }

  // Also mark stale "live" matches — any match live for 3h+ is definitely finished
  const { data: staleLive, error: staleLiveErr } = await supabase
    .from("matches")
    .update({ status: "completed" })
    .eq("status", "live")
    .lt("match_date", cutoff)
    .select("id");

  if (staleLiveErr) {
    errors.push(`cleanup-live: ${staleLiveErr.message}`);
  } else if (staleLive?.length) {
    log.push(`cleanup: marked ${staleLive.length} stale live matches as completed`);
  }

  // Step 5: Compute AI-ready features (full mode only)
  if (mode === "full") {
    await callFunction("compute-features");
  }

  // Step 6: Generate predictions for new matches (full mode only)
  if (mode === "full") {
    await callFunction("batch-generate-predictions");
  }

  // Step 7: Pre-match predictions for imminent matches
  await callFunction("pre-match-predictions");

  return new Response(
    JSON.stringify({
      success: errors.length === 0,
      mode,
      timestamp: new Date().toISOString(),
      log,
      errors,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
