import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Allow explicit mode override from request body
  let explicitMode: string | null = null;
  try {
    const body = await req.json();
    explicitMode = body.mode ?? null;
  } catch { /* no body */ }

  const log: string[] = [];
  const errors: string[] = [];

  // ── Smart mode detection ──
  let effectiveMode = "idle";

  if (explicitMode === "full") {
    effectiveMode = "full";
  } else if (explicitMode && ["idle", "pre_match", "live"].includes(explicitMode)) {
    effectiveMode = explicitMode;
  } else {
    // Auto-detect based on DB state
    const nowIso = new Date().toISOString();
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // Check for live matches
    const { data: liveMatches, error: liveErr } = await supabase
      .from("matches")
      .select("id")
      .eq("status", "live")
      .limit(1);

    if (liveErr) errors.push(`live-check: ${liveErr.message}`);

    // Check for matches starting within 1 hour
    const { data: imminentMatches, error: immErr } = await supabase
      .from("matches")
      .select("id")
      .eq("status", "upcoming")
      .gte("match_date", nowIso)
      .lte("match_date", oneHourFromNow)
      .limit(1);

    if (immErr) errors.push(`imminent-check: ${immErr.message}`);

    // Check for "stale upcoming" matches (should be live but weren't updated)
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data: staleUpcomingMatches, error: staleErr } = await supabase
      .from("matches")
      .select("id")
      .eq("status", "upcoming")
      .gte("match_date", threeHoursAgo)
      .lte("match_date", nowIso)
      .limit(1);

    if (staleErr) errors.push(`stale-upcoming-check: ${staleErr.message}`);

    if (liveMatches && liveMatches.length > 0) {
      effectiveMode = "live";
    } else if (staleUpcomingMatches && staleUpcomingMatches.length > 0) {
      effectiveMode = "live";
    } else if (imminentMatches && imminentMatches.length > 0) {
      effectiveMode = "pre_match";
    } else {
      effectiveMode = "idle";
    }

    // Daily full sync override at 06:00 UTC (between 06:00 and 06:09)
    const utcHour = new Date().getUTCHours();
    const utcMinute = new Date().getUTCMinutes();
    if (utcHour === 6 && utcMinute < 10) {
      effectiveMode = "full";
    }
  }

  log.push(`detected mode: ${effectiveMode}`);

  let quotaTripped = false;

  async function callFunction(name: string, body: Record<string, unknown> = {}) {
    if (quotaTripped) {
      log.push(`${name}: SKIPPED (provider quota exhausted)`);
      return null;
    }
    const start = Date.now();
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      const ms = Date.now() - start;
      // Detect quota-exhausted upstream error
      const dataStr = JSON.stringify(data);
      if (dataStr.includes("reached the request limit") || dataStr.includes("rateLimit")) {
        quotaTripped = true;
        errors.push(`${name}: provider quota reached, backing off (${ms}ms)`);
        return data;
      }
      if (!res.ok) {
        errors.push(`${name}: HTTP ${res.status} (${ms}ms)`);
      } else {
        log.push(`${name}: OK (${ms}ms) ${dataStr.slice(0, 200)}`);
      }
      return data;
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
      return null;
    }
  }

  // Step 1: Sync API-Football data with detected mode
  await callFunction("sync-football-data", { mode: effectiveMode });

  // Step 1b: Backfill missing odds for upcoming matches (helps ML feature snapshot)
  if (effectiveMode === "pre_match" || effectiveMode === "full") {
    await callFunction("backfill-odds", { scope: "upcoming", max: 40 });
  }

  // Step 2: News scraping — full mode only
  if (effectiveMode === "full") {
    await callFunction("scrape-news");
  }

  // Step 4: Mark stale matches — but ONLY flip to "completed" if we actually have a final score.
  // Matches older than 3h with NULL goals → "unknown" (likely postponed/cancelled or sync gap).
  // This prevents broken "Final 0-0" UI and useless post-match reviews.
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  // 4a) With scores → completed
  const { data: staleWithScore, error: staleScoredErr } = await supabase
    .from("matches")
    .update({ status: "completed" })
    .in("status", ["upcoming", "live"])
    .lt("match_date", cutoff)
    .not("goals_home", "is", null)
    .not("goals_away", "is", null)
    .select("id");

  if (staleScoredErr) {
    errors.push(`cleanup-scored: ${staleScoredErr.message}`);
  } else if (staleWithScore?.length) {
    log.push(`cleanup: marked ${staleWithScore.length} stale matches as completed (with scores)`);
  }

  // 4b) Without scores → unknown (excluded from review pipelines and live UI)
  const { data: staleNoScore, error: staleUnkErr } = await supabase
    .from("matches")
    .update({ status: "unknown" })
    .in("status", ["upcoming", "live"])
    .lt("match_date", cutoff)
    .or("goals_home.is.null,goals_away.is.null")
    .select("id");

  if (staleUnkErr) {
    errors.push(`cleanup-unknown: ${staleUnkErr.message}`);
  } else if (staleNoScore?.length) {
    log.push(`cleanup: marked ${staleNoScore.length} stale matches as unknown (no score)`);
  }

  // Step 4c: Phase 1 — Materialize match_labels for any completed matches that don't yet have them
  // (Covers both freshly-completed matches from 4a and any historical gaps in the last 7 days.)
  try {
    const lookback = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: completedMatches } = await supabase
      .from("matches")
      .select("id, goals_home, goals_away")
      .eq("status", "completed")
      .gte("match_date", lookback)
      .not("goals_home", "is", null)
      .not("goals_away", "is", null);

    if (completedMatches?.length) {
      const ids = completedMatches.map((m: any) => m.id);
      const { data: existingLabels } = await supabase
        .from("match_labels")
        .select("match_id")
        .in("match_id", ids);
      const have = new Set((existingLabels ?? []).map((r: any) => r.match_id));
      const toInsert = completedMatches
        .filter((m: any) => !have.has(m.id))
        .map((m: any) => {
          const gh = m.goals_home as number;
          const ga = m.goals_away as number;
          const total = gh + ga;
          const outcome = gh > ga ? "home" : gh < ga ? "away" : "draw";
          return {
            match_id: m.id,
            goals_home: gh,
            goals_away: ga,
            outcome,
            btts: gh > 0 && ga > 0,
            total_goals: total,
            over_05: total > 0,
            over_15: total > 1,
            over_25: total > 2,
            over_35: total > 3,
            source: "auto-sync",
          };
        });

      if (toInsert.length) {
        const { error: lblErr } = await supabase
          .from("match_labels")
          .upsert(toInsert, { onConflict: "match_id" });
        if (lblErr) errors.push(`match-labels: ${lblErr.message}`);
        else log.push(`match_labels: wrote ${toInsert.length} new label rows`);
      }
    }
  } catch (e) {
    errors.push(`match-labels: ${(e as Error).message}`);
  }

  // Step 5: Compute features — full, pre_match, and live modes
  if (effectiveMode === "full" || effectiveMode === "pre_match" || effectiveMode === "live") {
    await callFunction("compute-features");
  }

  // Step 5b: Enrichment layer — pre_match and live modes
  if (effectiveMode === "pre_match" || effectiveMode === "live") {
    // Enrich imminent matches (within 60 min)
    const oneHrLater = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { data: enrichTargets } = await supabase
      .from("matches")
      .select("id")
      .eq("status", "upcoming")
      .lte("match_date", oneHrLater)
      .order("match_date", { ascending: true })
      .limit(10);

    if (enrichTargets?.length) {
      for (const m of enrichTargets) {
        await callFunction("enrich-match-context", { match_id: m.id });
        await callFunction("football-intelligence", { match_id: m.id });
      }
    }
  }

  // Step 6: Batch predictions — full mode only
  if (effectiveMode === "full") {
    await callFunction("batch-generate-predictions");
  }

  // Step 7: Pre-match predictions — skip in idle mode
  if (effectiveMode !== "idle") {
    await callFunction("pre-match-predictions");
  }

  // Step 8: Batch review completed matches (populate prediction_reviews)
  if (effectiveMode === "full" || effectiveMode === "idle") {
    await callFunction("batch-review-matches");
  }

  // Step 9: Recompute model performance (recalibrate weights)
  if (effectiveMode === "full") {
    await callFunction("compute-model-performance");
  }

  return new Response(
    JSON.stringify({
      success: errors.length === 0,
      mode: effectiveMode,
      timestamp: new Date().toISOString(),
      log,
      errors,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
