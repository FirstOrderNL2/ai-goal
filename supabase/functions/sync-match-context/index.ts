import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Pulls lineups + injuries from API-Football v3 for upcoming matches and
 * writes them into `match_context.lineup_home/away` and `injuries_home/away`.
 *
 * After writing, triggers `enrich-match-context` so `match_enrichment.lineup_confirmed`
 * and `key_player_missing_*` get recomputed and frozen.
 *
 * Modes:
 *  - "lineups"  → only fetch lineups (T-60 to T+30 window)
 *  - "injuries" → only fetch injuries (T-72h to T+0)
 *  - "all"      → both (default)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("API_FOOTBALL_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API_FOOTBALL_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  let mode: "lineups" | "injuries" | "all" = "all";
  let maxFixtures = 80;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.mode === "lineups" || body.mode === "injuries" || body.mode === "all") mode = body.mode;
      if (typeof body.max === "number") maxFixtures = Math.max(1, Math.min(200, body.max));
    }
  } catch { /* defaults */ }

  const now = Date.now();
  const log: string[] = [];
  let lineupsFetched = 0;
  let injuriesFetched = 0;
  let triggeredEnrichment = 0;
  let quotaTripped = false;

  // ── Pick fixture window ──
  const lineupStart = new Date(now - 30 * 60 * 1000).toISOString();
  const lineupEnd = new Date(now + 90 * 60 * 1000).toISOString();
  const injuryStart = new Date(now - 1 * 60 * 60 * 1000).toISOString();
  const injuryEnd = new Date(now + 72 * 60 * 60 * 1000).toISOString();

  // Helper: API-Football call with quota detection
  async function af(url: string): Promise<any | null> {
    if (quotaTripped) return null;
    try {
      const res = await fetch(url, { headers: { "x-apisports-key": apiKey } });
      const json = await res.json().catch(() => ({} as any));
      if (Array.isArray(json?.errors) && json.errors.some((e: any) => String(e).toLowerCase().includes("limit"))) {
        quotaTripped = true;
        log.push("provider quota reached — backing off");
        return null;
      }
      if (json?.errors && typeof json.errors === "object") {
        const errStr = JSON.stringify(json.errors);
        if (errStr.toLowerCase().includes("limit")) {
          quotaTripped = true;
          log.push("provider quota reached — backing off");
          return null;
        }
      }
      if (!res.ok) {
        log.push(`HTTP ${res.status} ${url.slice(-80)}`);
        return null;
      }
      return json;
    } catch (e) {
      log.push(`fetch error: ${(e as Error).message}`);
      return null;
    }
  }

  // ── Phase A: lineups ──
  if (mode === "all" || mode === "lineups") {
    const { data: imminent } = await supabase
      .from("matches")
      .select("id, api_football_id, team_home_id, team_away_id, match_date")
      .not("api_football_id", "is", null)
      .in("status", ["upcoming", "live"])
      .gte("match_date", lineupStart)
      .lte("match_date", lineupEnd)
      .order("match_date", { ascending: true })
      .limit(maxFixtures);

    log.push(`lineups: ${imminent?.length ?? 0} candidate matches`);

    for (const m of imminent ?? []) {
      if (quotaTripped) break;
      const json = await af(`https://v3.football.api-sports.io/fixtures/lineups?fixture=${m.api_football_id}`);
      if (!json) continue;
      const arr = json.response ?? [];
      if (arr.length < 2) continue;

      // Map API team IDs back to our teams via api_football_id
      const apiTeamIds = arr.map((r: any) => r?.team?.id).filter(Boolean);
      const { data: teamRows } = await supabase
        .from("teams")
        .select("id, api_football_id")
        .in("api_football_id", apiTeamIds);
      const apiToInternal = new Map<number, string>();
      for (const t of teamRows ?? []) apiToInternal.set((t as any).api_football_id, (t as any).id);

      let lineupHome: any[] = [];
      let lineupAway: any[] = [];
      for (const r of arr) {
        const internal = apiToInternal.get(r?.team?.id);
        const startXI = (r.startXI ?? []).map((p: any) => ({
          name: p.player?.name,
          number: p.player?.number,
          pos: p.player?.pos,
        }));
        if (internal === m.team_home_id) lineupHome = startXI;
        else if (internal === m.team_away_id) lineupAway = startXI;
      }

      if (lineupHome.length === 0 && lineupAway.length === 0) continue;

      // Upsert: keep existing injuries/news_items if any
      const { data: existing } = await supabase
        .from("match_context")
        .select("injuries_home, injuries_away, news_items, suspensions, weather, h2h_summary")
        .eq("match_id", m.id)
        .maybeSingle();

      await supabase.from("match_context").upsert({
        match_id: m.id,
        lineup_home: lineupHome,
        lineup_away: lineupAway,
        injuries_home: existing?.injuries_home ?? [],
        injuries_away: existing?.injuries_away ?? [],
        news_items: existing?.news_items ?? [],
        suspensions: existing?.suspensions ?? [],
        weather: existing?.weather ?? null,
        h2h_summary: existing?.h2h_summary ?? null,
        scraped_at: new Date().toISOString(),
      }, { onConflict: "match_id" });

      lineupsFetched++;

      // Trigger enrich-match-context to recompute lineup_confirmed + freeze
      try {
        await fetch(`${supabaseUrl}/functions/v1/enrich-match-context`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ match_id: m.id }),
        });
        triggeredEnrichment++;
      } catch { /* best-effort */ }

      await new Promise((r) => setTimeout(r, 130));
    }
  }

  // ── Phase B: injuries ──
  if ((mode === "all" || mode === "injuries") && !quotaTripped) {
    const { data: upcoming } = await supabase
      .from("matches")
      .select("id, api_football_id, team_home_id, team_away_id, match_date")
      .not("api_football_id", "is", null)
      .eq("status", "upcoming")
      .gte("match_date", injuryStart)
      .lte("match_date", injuryEnd)
      .order("match_date", { ascending: true })
      .limit(maxFixtures);

    log.push(`injuries: ${upcoming?.length ?? 0} candidate matches`);

    for (const m of upcoming ?? []) {
      if (quotaTripped) break;
      const json = await af(`https://v3.football.api-sports.io/injuries?fixture=${m.api_football_id}`);
      if (!json) continue;
      const arr = json.response ?? [];

      // Resolve API team IDs to our internal IDs
      const apiTeamIds = [...new Set(arr.map((r: any) => r?.team?.id).filter(Boolean))];
      const { data: teamRows } = await supabase
        .from("teams")
        .select("id, api_football_id")
        .in("api_football_id", apiTeamIds.length ? apiTeamIds : [-1]);
      const apiToInternal = new Map<number, string>();
      for (const t of teamRows ?? []) apiToInternal.set((t as any).api_football_id, (t as any).id);

      const injHome: any[] = [];
      const injAway: any[] = [];
      for (const r of arr) {
        const internal = apiToInternal.get(r?.team?.id);
        const entry = {
          name: r?.player?.name,
          reason: r?.player?.reason || r?.player?.type,
          type: r?.player?.type,
        };
        if (internal === m.team_home_id) injHome.push(entry);
        else if (internal === m.team_away_id) injAway.push(entry);
      }

      const { data: existing } = await supabase
        .from("match_context")
        .select("lineup_home, lineup_away, news_items, suspensions, weather, h2h_summary")
        .eq("match_id", m.id)
        .maybeSingle();

      await supabase.from("match_context").upsert({
        match_id: m.id,
        injuries_home: injHome,
        injuries_away: injAway,
        lineup_home: existing?.lineup_home ?? [],
        lineup_away: existing?.lineup_away ?? [],
        news_items: existing?.news_items ?? [],
        suspensions: existing?.suspensions ?? [],
        weather: existing?.weather ?? null,
        h2h_summary: existing?.h2h_summary ?? null,
        scraped_at: new Date().toISOString(),
      }, { onConflict: "match_id" });

      injuriesFetched++;

      // Trigger enrichment so key_player_missing_* gets updated
      try {
        await fetch(`${supabaseUrl}/functions/v1/enrich-match-context`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ match_id: m.id }),
        });
        triggeredEnrichment++;
      } catch { /* best-effort */ }

      await new Promise((r) => setTimeout(r, 130));
    }
  }

  return new Response(JSON.stringify({
    success: true,
    mode,
    quota_tripped: quotaTripped,
    lineups_fetched: lineupsFetched,
    injuries_fetched: injuriesFetched,
    enrichment_triggered: triggeredEnrichment,
    log: log.slice(0, 10),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
