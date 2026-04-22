import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Dedicated post-match review batch runner.
 * Cron: every 15 minutes. Picks up to 40 completed matches from the last 7 days
 * that are still missing ai_post_match_review and dispatches them with bounded
 * parallelism (3 concurrent). Stops early on 429 / 402 from Lovable AI.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const startedAt = Date.now();
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body?.limit) || 40, 100);
  const lookbackDays = Math.min(Number(body?.lookback_days) || 7, 30);

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: targets, error } = await supabase
    .from("matches")
    .select("id, match_date, league")
    .eq("status", "completed")
    .is("ai_post_match_review", null)
    .gte("match_date", since)
    .order("match_date", { ascending: true })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!targets || targets.length === 0) {
    return new Response(JSON.stringify({ message: "No matches need reviews", processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const CONCURRENCY = 3;
  let succeeded = 0;
  let failed = 0;
  let stopReason: string | null = null;

  outer: for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const slice = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map(async (m: any) => {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/generate-post-match-review`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ match_id: m.id, system: true }),
        });
        return { id: m.id, status: res.status, ok: res.ok };
      } catch (e) {
        console.error("review dispatch failed", m.id, e);
        return { id: m.id, status: 0, ok: false };
      }
    }));

    for (const r of results) {
      if (r.ok) {
        succeeded++;
      } else {
        failed++;
        if (r.status === 429) { stopReason = "rate_limited"; break outer; }
        if (r.status === 402) { stopReason = "credits_exhausted"; break outer; }
      }
    }
    // Light pacing between batches
    if (i + CONCURRENCY < targets.length) await new Promise((r) => setTimeout(r, 1500));
  }

  await supabase.from("prediction_logs").insert({
    action: "auto_post_match_reviews",
    status: stopReason ?? (failed === 0 ? "ok" : "partial"),
    update_reason: `processed=${succeeded}/${targets.length} failed=${failed}${stopReason ? ` stop=${stopReason}` : ""}`,
    latency_ms: Date.now() - startedAt,
  });

  return new Response(JSON.stringify({
    success: true,
    candidates: targets.length,
    succeeded,
    failed,
    stop_reason: stopReason,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
