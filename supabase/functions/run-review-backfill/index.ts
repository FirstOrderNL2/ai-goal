import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const MAX_ITERATIONS = 20;
  let totalCreated = 0;
  let iterations = 0;
  let cursor: string | undefined = undefined;
  const log: any[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations++;
    const res = await fetch(`${supabaseUrl}/functions/v1/batch-review-matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ mode: "backfill", after_date: cursor }),
    });
    if (!res.ok) {
      log.push({ iteration: i + 1, error: `HTTP ${res.status}` });
      break;
    }
    const data = await res.json().catch(() => ({}));
    const created = data?.prediction_reviews_created ?? 0;
    const totalScanned = data?.total_completed ?? 0;
    totalCreated += created;
    log.push({ iteration: i + 1, created, scanned: totalScanned, cursor });
    cursor = data?.next_cursor || undefined;
    // Stop when no more matches were returned (cursor is null) — created can be 0 even
    // when the iteration scanned 1000 rows that all already had reviews.
    if (!cursor || totalScanned === 0) break;
    await new Promise((r) => setTimeout(r, 800));
  }

  // Snapshot label count after backfill
  const { count: labels } = await supabase
    .from("prediction_reviews")
    .select("id", { count: "exact", head: true })
    .not("actual_outcome", "is", null);

  return new Response(
    JSON.stringify({
      success: true,
      iterations,
      total_created: totalCreated,
      labeled_samples: labels ?? null,
      log,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
