import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Phase 5: dataset validation report — single JSON snapshot of ML readiness. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Aggregate counts in parallel.
  const [
    totalRes,
    trainingRes,
    publishedRes,
    lowQualityRes,
    snapshotRes,
    oddsRes,
    publishedWithOddsRes,
    matchFeatRes,
    enrichRes,
    intelRes,
    reviewsRes,
    matchesCompletedRes,
  ] = await Promise.all([
    supabase.from("predictions").select("*", { count: "exact", head: true }),
    supabase.from("predictions").select("*", { count: "exact", head: true }).eq("training_only", true),
    supabase.from("predictions").select("*", { count: "exact", head: true }).eq("publish_status", "published"),
    supabase.from("predictions").select("*", { count: "exact", head: true }).eq("publish_status", "low_quality"),
    supabase.from("predictions").select("*", { count: "exact", head: true }).not("feature_snapshot", "is", null),
    supabase.from("odds").select("*", { count: "exact", head: true }),
    // We need: published predictions whose match_id has odds. Use RPC-less approach via two queries.
    supabase.from("predictions").select("match_id").eq("publish_status", "published").limit(2000),
    supabase.from("match_features").select("*", { count: "exact", head: true }),
    supabase.from("match_enrichment").select("*", { count: "exact", head: true }),
    supabase.from("match_intelligence").select("*", { count: "exact", head: true }),
    supabase.from("prediction_reviews").select("*", { count: "exact", head: true }),
    supabase.from("matches").select("*", { count: "exact", head: true }).eq("status", "completed"),
  ]);

  const total = totalRes.count ?? 0;
  const trainingOnly = trainingRes.count ?? 0;
  const published = publishedRes.count ?? 0;
  const lowQuality = lowQualityRes.count ?? 0;
  const withSnapshot = snapshotRes.count ?? 0;
  const oddsRows = oddsRes.count ?? 0;
  const matchFeatures = matchFeatRes.count ?? 0;
  const enrichment = enrichRes.count ?? 0;
  const intelligence = intelRes.count ?? 0;
  const reviews = reviewsRes.count ?? 0;
  const completedMatches = matchesCompletedRes.count ?? 0;

  // Compute odds coverage on published predictions
  const publishedMatchIds = (publishedWithOddsRes.data ?? []).map((p: any) => p.match_id);
  let publishedWithOdds = 0;
  if (publishedMatchIds.length > 0) {
    const { data: ods } = await supabase
      .from("odds")
      .select("match_id")
      .in("match_id", publishedMatchIds);
    publishedWithOdds = new Set((ods ?? []).map((o: any) => o.match_id)).size;
  }
  const oddsCoveragePct = published > 0 ? Math.round((publishedWithOdds / published) * 1000) / 10 : 0;

  // Orphan checks (after FKs these should always be 0)
  const [orphanPredsRes, orphanFeatRes, orphanRevRes] = await Promise.all([
    supabase.rpc("now").then(() => supabase.from("predictions").select("id, match_id").is("match_id", null)).catch(() => ({ data: [] as any[] })),
    supabase.from("match_features").select("id, match_id").is("match_id", null),
    supabase.from("prediction_reviews").select("id").is("match_id", null),
  ]);

  const reviewCoveragePct = published > 0 ? Math.round((reviews / Math.max(published, completedMatches)) * 1000) / 10 : 0;
  const matchFeaturesCoveragePct = completedMatches > 0
    ? Math.round((matchFeatures / completedMatches) * 1000) / 10 : 0;
  const enrichmentCoveragePct = completedMatches > 0
    ? Math.round((enrichment / completedMatches) * 1000) / 10 : 0;
  const intelligenceCoveragePct = completedMatches > 0
    ? Math.round((intelligence / completedMatches) * 1000) / 10 : 0;
  const withSnapshotPct = total > 0 ? Math.round((withSnapshot / total) * 1000) / 10 : 0;

  // Usable training samples = predictions with snapshot AND a paired review.
  const { data: snapWithReview } = await supabase
    .from("predictions")
    .select("match_id, prediction_reviews:prediction_reviews!prediction_reviews_prediction_id_fkey(id)")
    .not("feature_snapshot", "is", null)
    .limit(5000);
  const usableSamples = (snapWithReview ?? []).filter((p: any) =>
    Array.isArray(p.prediction_reviews) && p.prediction_reviews.length > 0
  ).length;

  // Top missing feature fields across recent snapshots.
  const { data: recentSnaps } = await supabase
    .from("predictions")
    .select("feature_snapshot")
    .not("feature_snapshot", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const missingCounts: Record<string, number> = {};
  for (const row of recentSnaps ?? []) {
    const fs: Record<string, unknown> = (row as any).feature_snapshot ?? {};
    for (const [k, v] of Object.entries(fs)) {
      if (v == null) missingCounts[k] = (missingCounts[k] ?? 0) + 1;
    }
  }
  const missingFieldsTop10 = Object.entries(missingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([field, count]) => ({ field, missing_count: count }));

  const report = {
    generated_at: new Date().toISOString(),
    total_predictions: total,
    training_only: trainingOnly,
    published,
    low_quality: lowQuality,
    with_feature_snapshot: withSnapshot,
    with_feature_snapshot_pct: withSnapshotPct,
    odds_total_rows: oddsRows,
    odds_coverage_pct: oddsCoveragePct,
    odds_published_covered: publishedWithOdds,
    completed_matches: completedMatches,
    match_features_coverage_pct: matchFeaturesCoveragePct,
    match_enrichment_coverage_pct: enrichmentCoveragePct,
    match_intelligence_coverage_pct: intelligenceCoveragePct,
    review_coverage_pct: reviewCoveragePct,
    total_reviews: reviews,
    orphan_rows: {
      predictions: ((orphanPredsRes as any).data ?? []).length,
      match_features: (orphanFeatRes.data ?? []).length,
      prediction_reviews: (orphanRevRes.data ?? []).length,
    },
    usable_training_samples: usableSamples,
    missing_fields_top10: missingFieldsTop10,
    success_criteria: {
      snapshot_pct_ok: withSnapshotPct >= 95 || withSnapshot >= 2000,
      training_samples_ok: (withSnapshot >= 2000) || (usableSamples >= 2000),
      odds_coverage_ok: oddsCoveragePct >= 80,
      no_orphans_ok:
        ((orphanPredsRes as any).data ?? []).length === 0 &&
        (orphanFeatRes.data ?? []).length === 0 &&
        (orphanRevRes.data ?? []).length === 0,
    },
  };

  return new Response(JSON.stringify(report), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
