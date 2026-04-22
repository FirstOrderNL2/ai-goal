import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Coverage alert trip-wire.
 * Detects matches that started in the last 2h with NO published pre-match
 * prediction (publish_status='published' AND training_only=false). Logs each
 * occurrence to prediction_logs so the regression cannot return silently.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  const { data: recent, error } = await supabase
    .from("matches")
    .select("id, match_date, league, predictions(publish_status, training_only)")
    .gte("match_date", twoHoursAgo)
    .lte("match_date", now.toISOString())
    .order("match_date", { ascending: true })
    .limit(500);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const missing = (recent ?? []).filter((m: any) => {
    const preds = Array.isArray(m.predictions) ? m.predictions : (m.predictions ? [m.predictions] : []);
    if (preds.length === 0) return true;
    const p = preds[0];
    return p.publish_status !== "published" || p.training_only === true;
  });

  if (missing.length > 0) {
    const rows = missing.map((m: any) => ({
      match_id: m.id,
      action: "coverage_alert",
      status: "missing_pre_match_prediction",
      update_reason: `kickoff=${m.match_date} league=${m.league}`,
    }));
    await supabase.from("prediction_logs").insert(rows);
  }

  return new Response(JSON.stringify({
    checked: recent?.length ?? 0,
    missing: missing.length,
    matches: missing.map((m: any) => ({ id: m.id, match_date: m.match_date, league: m.league })),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
