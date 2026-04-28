// Phase 3: append-training-example
// For each newly-labeled, pre-match prediction run we don't yet have an example for,
// build a point-in-time feature row and upsert it into training_examples.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPointInTimeDataset } from "../_shared/dataset.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const lookbackDays = Number(body.lookback_days ?? 60);
  const limit = Number(body.limit ?? 1000);
  const datasetVersion = String(body.dataset_version ?? "v1");
  const modelFamily = String(body.model_family ?? "baseline");

  const cutoffStart = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const cutoffEnd = new Date().toISOString();

  // Skip rows we already wrote (uniqueness is on prediction_run_id+family+version)
  const { data: existing } = await supabase
    .from("training_examples")
    .select("prediction_run_id")
    .eq("model_family", modelFamily)
    .eq("dataset_version", datasetVersion)
    .gte("prediction_cutoff_ts", cutoffStart);
  const excludeRunIds = new Set((existing ?? []).map((r: any) => r.prediction_run_id));

  const rows = await buildPointInTimeDataset(supabase, {
    cutoffStart,
    cutoffEnd,
    limit,
    excludeRunIds,
  });

  if (!rows.length) {
    return new Response(JSON.stringify({ success: true, processed: 0, reason: "no new examples" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const inserts = rows.map((r) => ({
    prediction_run_id: r.prediction_run_id,
    match_id: r.match_id,
    prediction_cutoff_ts: r.prediction_cutoff_ts,
    feature_snapshot: r.feature_snapshot,
    label_snapshot: r.label_snapshot,
    model_family: modelFamily,
    dataset_version: datasetVersion,
    league: r.league,
  }));

  const { error: insErr, count } = await supabase
    .from("training_examples")
    .upsert(inserts, { onConflict: "prediction_run_id,model_family,dataset_version", ignoreDuplicates: true, count: "exact" });

  if (insErr) {
    return new Response(JSON.stringify({ success: false, error: insErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    processed: count ?? inserts.length,
    candidates: rows.length,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
