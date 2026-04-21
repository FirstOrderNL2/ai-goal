/**
 * Prediction query filter helpers.
 *
 * Centralizes the dataset-hygiene rules so production UI never accidentally
 * displays training-only or low-quality predictions, and ML/training pipelines
 * explicitly opt into the broader slice.
 *
 * USAGE
 *   supabase.from("predictions").select("*"); // ❌ never — pick a filter
 *   productionFilter(supabase.from("predictions").select("*")); // ✅ UI
 *   trainingFilter(supabase.from("predictions").select("*"));   // ✅ ML loaders
 *
 * Rules enforced by `productionFilter`:
 *   - training_only = false      → never show offline-training-only rows
 *   - publish_status = 'published' → never show low-quality / training_only statuses
 *
 * `trainingFilter` is intentionally permissive (returns the query untouched)
 * but exists as a marker so future readers know the call site is reading the
 * full dataset on purpose.
 */

// We type the input as `any` because PostgrestFilterBuilder's generics differ
// between table schemas and we just want to chain `.eq` calls.
export function productionFilter<T = any>(query: T): T {
  // @ts-expect-error — chained Supabase builder is opaque to plain generics
  return query.eq("training_only", false).eq("publish_status", "published");
}

export function trainingFilter<T = any>(query: T): T {
  // No-op marker. Returns the full slice including training_only + low_quality.
  return query;
}
