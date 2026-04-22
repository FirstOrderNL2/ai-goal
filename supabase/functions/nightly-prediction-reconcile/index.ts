// Nightly safety-net: scans matches in the next 48h, force-generates predictions for any without one.
// Cron: 02:30 Berlin daily.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const log: string[] = [];

  const { data: matches, error } = await supabase
    .from("matches")
    .select("id, match_date, predictions(match_id)")
    .eq("status", "upcoming")
    .gte("match_date", now.toISOString())
    .lte("match_date", in48h)
    .order("match_date", { ascending: true })
    .limit(500);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const missing = (matches ?? []).filter((m: any) => {
    const preds = Array.isArray(m.predictions) ? m.predictions : (m.predictions ? [m.predictions] : []);
    return preds.length === 0;
  });

  const CAP = 100;
  const toProcess = missing.slice(0, CAP);
  let filled = 0;
  let failed = 0;

  for (const m of toProcess as any[]) {
    try {
      // Pre-warm context (best-effort)
      await fetch(`${supabaseUrl}/functions/v1/enrich-match-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ match_id: m.id }),
      }).catch(() => {});

      const res = await fetch(`${supabaseUrl}/functions/v1/generate-statistical-prediction`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ match_id: m.id, update_reason: "nightly_reconcile" }),
      });
      if (res.ok) {
        filled++;
        await supabase.from("prediction_logs").insert({
          match_id: m.id, action: "generate", status: "success", update_reason: "nightly_reconcile",
        });
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
      log.push(`error ${m.id}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  return new Response(
    JSON.stringify({
      scanned: matches?.length ?? 0,
      missing_total: missing.length,
      processed: toProcess.length,
      filled,
      failed,
      capped: missing.length > CAP,
      log: log.slice(0, 50),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
