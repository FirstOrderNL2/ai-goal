import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const INTERVALS = [
  { label: "60m", minutesBefore: 60 },
  { label: "30m", minutesBefore: 30 },
  { label: "10m", minutesBefore: 10 },
  { label: "5m", minutesBefore: 5 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const now = new Date();
  const sixtyMinutesFromNow = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  // Find upcoming matches within the next 60 minutes
  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select("id, match_date")
    .eq("status", "upcoming")
    .gte("match_date", now.toISOString())
    .lte("match_date", sixtyMinutesFromNow)
    .order("match_date", { ascending: true })
    .limit(20);

  if (matchErr) {
    return new Response(JSON.stringify({ error: matchErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!matches || matches.length === 0) {
    return new Response(
      JSON.stringify({ message: "No matches within 60 minutes", processed: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const matchIds = matches.map((m: any) => m.id);
  const { data: predictions } = await supabase
    .from("predictions")
    .select("match_id, prediction_intervals, last_prediction_at")
    .in("match_id", matchIds);

  const predMap = new Map(
    (predictions ?? []).map((p: any) => [p.match_id, p])
  );

  const log: string[] = [];
  let processed = 0;

  for (const match of matches) {
    const kickoff = new Date(match.match_date).getTime();
    const minutesUntilKickoff = (kickoff - now.getTime()) / (60 * 1000);

    // Determine which interval window we're in
    let currentInterval: string | null = null;
    for (const iv of INTERVALS) {
      if (minutesUntilKickoff <= iv.minutesBefore) {
        currentInterval = iv.label;
      }
    }

    if (!currentInterval) continue;

    const existing = predMap.get(match.id);
    const completedIntervals: string[] = existing?.prediction_intervals ?? [];

    if (completedIntervals.includes(currentInterval)) {
      continue; // Already processed this interval
    }

    // Generate/refresh prediction
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-ai-prediction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ matchId: match.id }),
      });

      if (res.ok) {
        // Update tracking
        const newIntervals = [...completedIntervals, currentInterval];
        await supabase
          .from("predictions")
          .update({
            prediction_intervals: newIntervals,
            last_prediction_at: new Date().toISOString(),
          })
          .eq("match_id", match.id);

        log.push(`${match.id}: generated at ${currentInterval} (${Math.round(minutesUntilKickoff)}m before kickoff)`);
        processed++;
      } else {
        log.push(`${match.id}: failed HTTP ${res.status}`);
      }
    } catch (e) {
      log.push(`${match.id}: error ${e.message}`);
    }

    // Rate limit: max 5 per run
    if (processed >= 5) break;

    // Small delay between calls
    await new Promise((r) => setTimeout(r, 2000));
  }

  return new Response(
    JSON.stringify({ processed, log }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
