// Phase 3: maybe-trigger-retraining
// Cheap heuristic: enqueue a training_jobs row when ≥50 new training_examples have been
// added since the last succeeded job for this (model_family, dataset_version).
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAdmin, corsHeaders } from "../_shared/admin-auth.ts";

const MIN_NEW_EXAMPLES = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.resp;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const modelFamily = String(body.model_family ?? "baseline");
  const datasetVersion = String(body.dataset_version ?? "v1");
  const force = !!body.force;

  // Last succeeded job for this family+version
  const { data: lastJob } = await supabase
    .from("training_jobs")
    .select("id, finished_at, n_train, n_holdout")
    .eq("model_family", modelFamily)
    .eq("dataset_version", datasetVersion)
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const since = lastJob?.finished_at ?? new Date(0).toISOString();

  // Are there already queued/running jobs? Don't double-enqueue.
  const { data: pending } = await supabase
    .from("training_jobs")
    .select("id")
    .eq("model_family", modelFamily)
    .eq("dataset_version", datasetVersion)
    .in("status", ["queued", "running"])
    .limit(1);

  if (pending?.length && !force) {
    return new Response(JSON.stringify({ success: true, enqueued: false, reason: "job already pending" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { count: newSince } = await supabase
    .from("training_examples")
    .select("id", { count: "exact", head: true })
    .eq("model_family", modelFamily)
    .eq("dataset_version", datasetVersion)
    .gt("created_at", since);

  const newCount = newSince ?? 0;
  if (newCount < MIN_NEW_EXAMPLES && !force) {
    return new Response(JSON.stringify({
      success: true, enqueued: false,
      reason: `only ${newCount} new examples since last job (need ≥ ${MIN_NEW_EXAMPLES})`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: job, error } = await supabase
    .from("training_jobs")
    .insert({
      model_family: modelFamily,
      dataset_version: datasetVersion,
      status: "queued",
      notes: `auto-enqueued; ${newCount} new examples since ${since}`,
    })
    .select("id")
    .single();

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, enqueued: true, job_id: job.id, new_examples: newCount }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
