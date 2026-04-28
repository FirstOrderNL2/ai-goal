// Phase 4.5: run-shadow-predictions
// For each shadow artifact, score every recent pre_match prediction_run that
// doesn't already have a shadow row for that artifact. Idempotent via UNIQUE
// (prediction_run_id, artifact_id). Reads only the immutable feature_snapshot
// from prediction_runs — no recomputation, no leakage.
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAdmin, corsHeaders } from "../_shared/admin-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Same softmax-based scoring head used by train-challenger-model. Pure function.
function score(features: Record<string, number>, weights: any): {
  probabilities: { home: number; draw: number; away: number };
  expected_goals: { home: number; away: number };
} {
  const W: number[][] = weights?.W ?? [];
  const b: number[] = weights?.b ?? [0, 0, 0];
  const keys: string[] = weights?.feature_keys ?? [];
  const x = keys.map((k) => Number(features?.[k] ?? 0));

  const logits = [0, 1, 2].map((i) => {
    let s = b[i] ?? 0;
    const row = W[i] ?? [];
    for (let j = 0; j < x.length; j++) s += (row[j] ?? 0) * x[j];
    return s;
  });
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  const [home, draw, away] = exps.map((e) => e / sum);

  // expected goals: prefer artifact-scored xg if weights provide a head; else
  // fall back to the snapshot's xg fields so shadow stays comparable.
  const xg_home = Number(features?.xg_home ?? features?.poisson_xg_home ?? 1.4);
  const xg_away = Number(features?.xg_away ?? features?.poisson_xg_away ?? 1.1);

  return {
    probabilities: { home, draw, away },
    expected_goals: { home: xg_home, away: xg_away },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.resp;

  let body: any = {};
  try { body = await req.json(); } catch { /* empty ok */ }
  const limit = Math.min(Math.max(Number(body.limit ?? 200), 1), 1000);
  const lookbackDays = Math.min(Math.max(Number(body.lookback_days ?? 14), 1), 90);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // 1. List active shadow artifacts.
  const { data: artifacts, error: aErr } = await supabase
    .from("model_artifacts")
    .select("id, model_family, weights, feature_version")
    .eq("status", "shadow")
    .order("created_at", { ascending: false });
  if (aErr) {
    return new Response(JSON.stringify({ error: aErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!artifacts?.length) {
    return new Response(JSON.stringify({ ok: true, artifacts: 0, scored: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Pull recent pre_match runs (snapshot only — no recomputation).
  const { data: runs, error: rErr } = await supabase
    .from("prediction_runs")
    .select("id, match_id, feature_snapshot, created_at")
    .eq("run_type", "pre_match")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (rErr) {
    return new Response(JSON.stringify({ error: rErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let scored = 0;
  let skipped = 0;
  let failed = 0;

  for (const art of artifacts) {
    for (const run of runs ?? []) {
      try {
        if (!run.feature_snapshot) { skipped++; continue; }
        const out = score(run.feature_snapshot as Record<string, number>, art.weights);

        const { error: insErr } = await supabase
          .from("shadow_predictions")
          .insert({
            prediction_run_id: run.id,
            artifact_id: art.id,
            probabilities: out.probabilities,
            expected_goals: out.expected_goals,
          });

        if (insErr) {
          // Unique violation = already scored, treat as success/idempotent.
          if (String(insErr.message).toLowerCase().includes("duplicate")
              || (insErr as any).code === "23505") {
            skipped++;
          } else {
            failed++;
            console.error("[run-shadow-predictions] insert error", insErr.message);
          }
        } else {
          scored++;
        }
      } catch (e) {
        failed++;
        console.error("[run-shadow-predictions] score error", e);
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      artifacts: artifacts.length,
      runs_considered: runs?.length ?? 0,
      scored,
      skipped_duplicates: skipped,
      failed,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
