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
        log.push(`${name}: OK (${ms}ms)`);
      }
      return data;
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
      return null;
    }
  }

  // Step 1: Sync Sportradar data (live scores, odds)
  await callFunction("sync-sportradar-data");

  // Step 2: Scrape matches from Dutch sites
  await callFunction("scrape-matches");

  // Step 3: Scrape news
  await callFunction("scrape-news");

  // Step 4: Mark stale "upcoming" matches as completed
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
  const { data: stale, error: staleErr } = await supabase
    .from("matches")
    .update({ status: "completed" })
    .eq("status", "upcoming")
    .lt("match_date", cutoff)
    .select("id");

  if (staleErr) {
    errors.push(`cleanup: ${staleErr.message}`);
  } else if (stale && stale.length > 0) {
    log.push(`cleanup: marked ${stale.length} stale matches as completed`);
  }

  // Step 5: Generate predictions for new matches
  await callFunction("batch-generate-predictions");

  return new Response(
    JSON.stringify({
      success: errors.length === 0,
      timestamp: new Date().toISOString(),
      log,
      errors,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
