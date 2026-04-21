import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Phase 3: Backfill odds for matches missing them.
 * - Targets upcoming (next 14 days) + completed (recent) matches without an `odds` row.
 * - Calls API-Football v3 /odds in batches of 20 fixture IDs.
 * - Inserts the average across available 1X2 bookmakers (Bet365 preferred).
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

  let scope: "upcoming" | "completed" | "all" = "upcoming";
  let maxFixtures = 60;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.scope) scope = body.scope;
      if (body.max) maxFixtures = Math.max(1, Math.min(200, body.max));
    }
  } catch { /* defaults */ }

  // Find matches missing odds.
  const now = new Date().toISOString();
  const horizon = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  const past = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  let q = supabase
    .from("matches")
    .select("id, api_football_id, status, match_date")
    .not("api_football_id", "is", null)
    .order("match_date", { ascending: true })
    .limit(maxFixtures * 3);

  if (scope === "upcoming") {
    q = q.eq("status", "upcoming").gte("match_date", now).lte("match_date", horizon);
  } else if (scope === "completed") {
    q = q.eq("status", "completed").gte("match_date", past).lte("match_date", now);
  }

  const { data: candidates, error: candErr } = await q;
  if (candErr) {
    return new Response(JSON.stringify({ error: candErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const candIds = (candidates ?? []).map((m: any) => m.id);
  if (candIds.length === 0) {
    return new Response(JSON.stringify({ success: true, processed: 0, message: "no candidates" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Filter to matches without existing odds.
  const { data: existingOdds } = await supabase.from("odds").select("match_id").in("match_id", candIds);
  const haveOdds = new Set((existingOdds ?? []).map((o: any) => o.match_id));
  const targets = (candidates ?? []).filter((m: any) => !haveOdds.has(m.id)).slice(0, maxFixtures);

  if (targets.length === 0) {
    return new Response(JSON.stringify({ success: true, processed: 0, message: "all covered" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Call API-Football per fixture (the /odds endpoint accepts only one fixture per call reliably).
  const inserts: Array<{ match_id: string; home_win_odds: number; draw_odds: number; away_win_odds: number }> = [];
  const errors: string[] = [];

  for (const m of targets) {
    try {
      const url = `https://v3.football.api-sports.io/odds?fixture=${m.api_football_id}`;
      const res = await fetch(url, { headers: { "x-apisports-key": apiKey } });
      if (!res.ok) {
        errors.push(`fx ${m.api_football_id}: HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      const responseArr = json.response ?? [];
      if (responseArr.length === 0) continue;

      // Pick Bet365 if present, else first bookmaker; find the "Match Winner" market.
      let pick: { home: number; draw: number; away: number } | null = null;
      for (const r of responseArr) {
        const bookmakers = r.bookmakers ?? [];
        const bet365 = bookmakers.find((b: any) => b.name?.toLowerCase().includes("bet365")) ?? bookmakers[0];
        if (!bet365) continue;
        const market = (bet365.bets ?? []).find((b: any) =>
          b.name === "Match Winner" || b.id === 1
        );
        if (!market) continue;
        const values = market.values ?? [];
        const homeV = values.find((v: any) => v.value === "Home")?.odd;
        const drawV = values.find((v: any) => v.value === "Draw")?.odd;
        const awayV = values.find((v: any) => v.value === "Away")?.odd;
        if (homeV && drawV && awayV) {
          pick = { home: parseFloat(homeV), draw: parseFloat(drawV), away: parseFloat(awayV) };
          break;
        }
      }
      if (pick && pick.home > 1 && pick.draw > 1 && pick.away > 1) {
        inserts.push({
          match_id: m.id,
          home_win_odds: pick.home,
          draw_odds: pick.draw,
          away_win_odds: pick.away,
        });
      }
    } catch (e) {
      errors.push(`fx ${m.api_football_id}: ${(e as Error).message}`);
    }
    // 10 req/sec rate limit safety
    await new Promise((r) => setTimeout(r, 110));
  }

  if (inserts.length > 0) {
    const { error: insErr } = await supabase.from("odds").upsert(inserts, { onConflict: "match_id" });
    if (insErr) errors.push(`upsert: ${insErr.message}`);
  }

  return new Response(JSON.stringify({
    success: true,
    candidates: candidates?.length ?? 0,
    targets: targets.length,
    inserted: inserts.length,
    errors: errors.slice(0, 5),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
