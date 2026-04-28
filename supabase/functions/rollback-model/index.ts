// Phase 4: rollback champion to a previous artifact.
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAdmin, corsHeaders } from "../_shared/admin-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.resp;

  try {
    const { target_artifact_id } = await req.json();
    if (!target_artifact_id) {
      return new Response(JSON.stringify({ error: "target_artifact_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: target } = await supabase
      .from("model_artifacts")
      .select("*")
      .eq("id", target_artifact_id)
      .maybeSingle();
    if (!target) {
      return new Response(JSON.stringify({ error: "target_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["archived", "rolled_back", "shadow"].includes(target.status)) {
      return new Response(JSON.stringify({ error: "target_not_rollbackable", status: target.status }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: currentChampion } = await supabase
      .from("model_artifacts")
      .select("*")
      .eq("model_family", target.model_family)
      .eq("status", "champion")
      .maybeSingle();

    const nowIso = new Date().toISOString();
    if (currentChampion) {
      await supabase
        .from("model_artifacts")
        .update({ status: "rolled_back", rolled_back_at: nowIso })
        .eq("id", currentChampion.id);
    }
    await supabase
      .from("model_artifacts")
      .update({ status: "champion", promoted_at: nowIso })
      .eq("id", target.id);
    await supabase
      .from("model_registry")
      .upsert(
        { model_family: target.model_family, champion_artifact_id: target.id, updated_at: nowIso },
        { onConflict: "model_family" },
      );

    return new Response(
      JSON.stringify({ ok: true, rolled_back_from: currentChampion?.id ?? null, new_champion: target.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
