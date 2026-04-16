import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Parse the `round` field to determine match_stage */
function parseStage(round: string | null, league: string): string {
  if (!round) return "regular";
  const r = round.toLowerCase();
  if (/final/i.test(r) && !/quarter|semi/i.test(r)) return "final";
  if (/semi/i.test(r)) return "semi_final";
  if (/quarter/i.test(r)) return "quarter_final";
  if (/round of 16|last 16|r16/i.test(r)) return "round_of_16";
  if (/round of 32|r32|last 32/i.test(r)) return "round_of_32";
  if (/group/i.test(r)) return "group";
  if (/play.?off/i.test(r)) return "playoff";
  return "regular";
}

/** Determine competition_type from league name */
function parseCompetitionType(league: string): string {
  const l = league.toLowerCase();
  const cups = [
    "champions league", "europa league", "conference league",
    "fa cup", "copa del rey", "dfb-pokal", "coupe de france",
    "coppa italia", "knvb beker", "league cup", "carabao",
    "super cup", "community shield",
  ];
  const international = [
    "world cup", "euro ", "nations league", "copa america",
    "africa cup", "asian cup", "concacaf", "friendlies",
  ];
  if (cups.some(c => l.includes(c))) return "cup";
  if (international.some(c => l.includes(c))) return "international";
  return "league";
}

/** Known derby pairs (partial name matching) */
const DERBY_PAIRS = [
  ["arsenal", "tottenham"], ["liverpool", "everton"], ["manchester united", "manchester city"],
  ["real madrid", "barcelona"], ["ac milan", "inter"], ["roma", "lazio"],
  ["ajax", "feyenoord"], ["ajax", "psv"], ["feyenoord", "psv"],
  ["dortmund", "schalke"], ["dortmund", "bayern"], ["celtic", "rangers"],
  ["galatasaray", "fenerbahce"], ["benfica", "porto"], ["boca", "river"],
  ["atletico madrid", "real madrid"], ["lyon", "marseille"], ["psg", "marseille"],
];

function isDerby(homeName: string, awayName: string): boolean {
  const h = homeName.toLowerCase();
  const a = awayName.toLowerCase();
  return DERBY_PAIRS.some(([x, y]) =>
    (h.includes(x) && a.includes(y)) || (h.includes(y) && a.includes(x))
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { match_id } = await req.json();
    if (!match_id) {
      return new Response(JSON.stringify({ error: "match_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch match + features in parallel
    const [{ data: match }, { data: features }] = await Promise.all([
      supabase.from("matches")
        .select("id, league, round, team_home_id, team_away_id, home_team:teams!matches_team_home_id_fkey(name), away_team:teams!matches_team_away_id_fkey(name)")
        .eq("id", match_id)
        .single(),
      supabase.from("match_features")
        .select("league_position_home, league_position_away")
        .eq("match_id", match_id)
        .maybeSingle(),
    ]);

    if (!match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const competitionType = parseCompetitionType(match.league);
    const matchStage = parseStage(match.round, match.league);

    // Base importance from stage
    const stageImportance: Record<string, number> = {
      final: 1.0, semi_final: 0.9, quarter_final: 0.8,
      round_of_16: 0.7, round_of_32: 0.65, playoff: 0.85,
      group: 0.6, regular: 0.5,
    };
    let importance = stageImportance[matchStage] ?? 0.5;

    // Position-based context
    const posHome = features?.league_position_home;
    const posAway = features?.league_position_away;
    if (posHome != null && posAway != null && matchStage === "regular") {
      const isTitleRace = posHome <= 3 || posAway <= 3;
      const isRelegation = posHome >= 16 || posAway >= 16; // approximate
      if (isTitleRace) importance = Math.min(1.0, importance + 0.2);
      if (isRelegation) importance = Math.min(1.0, importance + 0.15);
    }

    // Derby bonus
    const homeName = (match as any).home_team?.name || "";
    const awayName = (match as any).away_team?.name || "";
    if (isDerby(homeName, awayName)) {
      importance = Math.min(1.0, importance + 0.1);
    }

    // Round to 2 decimals
    importance = Math.round(importance * 100) / 100;

    // Update match record
    const { error: updateErr } = await supabase
      .from("matches")
      .update({
        competition_type: competitionType,
        match_stage: matchStage,
        match_importance: importance,
      })
      .eq("id", match_id);

    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({
      success: true, match_id, competition_type: competitionType,
      match_stage: matchStage, match_importance: importance,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Compute match importance error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
