// Phase 4: promote a shadow artifact to champion (admin-only).
// Hard gates enforced via _shared/promotion-gates.ts on the artifact's stored metrics_json.
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAdmin, corsHeaders } from "../_shared/admin-auth.ts";
import { evaluateGates, type Metrics, type LeagueMetric } from "../_shared/promotion-gates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.resp;

  try {
    const { artifact_id, force = false } = await req.json();
    if (!artifact_id) {
      return new Response(JSON.stringify({ error: "artifact_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: artifact, error: aErr } = await supabase
      .from("model_artifacts")
      .select("*")
      .eq("id", artifact_id)
      .maybeSingle();
    if (aErr || !artifact) {
      return new Response(JSON.stringify({ error: "artifact_not_found", details: aErr?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (artifact.status === "champion") {
      return new Response(JSON.stringify({ ok: true, message: "already_champion" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find current champion (if any) for this family
    const { data: currentChampion } = await supabase
      .from("model_artifacts")
      .select("*")
      .eq("model_family", artifact.model_family)
      .eq("status", "champion")
      .maybeSingle();

    // Build gate input from stored metrics_json
    const m = (artifact.metrics_json ?? {}) as any;
    const cm = (currentChampion?.metrics_json ?? {}) as any;

    const overallChallenger: Metrics = m.overall ?? { log_loss: NaN, brier: NaN, rps: NaN, ece: NaN, mae_goals: NaN };
    const overallChampion: Metrics | null = currentChampion ? (cm.overall ?? null) : null;
    const recentChallenger = m.recent_holdout ?? { log_loss: NaN, brier: NaN };
    const recentChampion = currentChampion ? (cm.recent_holdout ?? null) : null;
    const perLeague: LeagueMetric[] = Array.isArray(m.per_league) ? m.per_league : [];

    const gate = evaluateGates({
      n_holdout: artifact.n_holdout ?? 0,
      overall_challenger: overallChallenger,
      overall_champion: overallChampion,
      recent_challenger: recentChallenger,
      recent_champion: recentChampion,
      per_league: perLeague,
    });

    // Phase 4.5 evidence gate: even if metric gates pass, require enough total
    // labeled examples and holdout volume before any production promotion.
    // Forcing bypasses both metric and evidence gates (admin override only).
    const MIN_HOLDOUT_FOR_PROMOTION = 100;
    const MIN_TOTAL_LABELED = 400;
    const evidenceReasons: string[] = [];
    if ((artifact.n_holdout ?? 0) < MIN_HOLDOUT_FOR_PROMOTION) {
      evidenceReasons.push(`insufficient_holdout_for_promotion:${artifact.n_holdout ?? 0}<${MIN_HOLDOUT_FOR_PROMOTION}`);
    }
    {
      const { count: totalLabeled } = await supabase
        .from("training_examples")
        .select("id", { count: "exact", head: true })
        .eq("model_family", artifact.model_family);
      if ((totalLabeled ?? 0) < MIN_TOTAL_LABELED) {
        evidenceReasons.push(`insufficient_total_labeled:${totalLabeled ?? 0}<${MIN_TOTAL_LABELED}`);
      }
    }

    const allReasons = [...gate.reasons, ...evidenceReasons];
    const blocked = (!gate.passes || evidenceReasons.length > 0);
    if (blocked && !force) {
      return new Response(
        JSON.stringify({
          ok: false,
          decision: "blocked",
          reasons: allReasons,
          gate_reasons: gate.reasons,
          evidence_reasons: evidenceReasons,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Promote: archive current champion, set this one champion, update registry.
    const nowIso = new Date().toISOString();
    if (currentChampion) {
      await supabase
        .from("model_artifacts")
        .update({ status: "archived" })
        .eq("id", currentChampion.id);
    }
    await supabase
      .from("model_artifacts")
      .update({ status: "champion", promoted_at: nowIso, notes: force ? "force-promoted" : artifact.notes })
      .eq("id", artifact.id);
    await supabase
      .from("model_registry")
      .upsert(
        { model_family: artifact.model_family, champion_artifact_id: artifact.id, updated_at: nowIso },
        { onConflict: "model_family" },
      );

    return new Response(
      JSON.stringify({
        ok: true,
        decision: "promoted",
        artifact_id: artifact.id,
        previous_champion_id: currentChampion?.id ?? null,
        forced: !!(force && !gate.passes),
        gate_reasons: gate.reasons,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[promote-model] error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
