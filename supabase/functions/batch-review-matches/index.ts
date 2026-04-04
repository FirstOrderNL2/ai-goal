import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find completed matches without post-match reviews
    const { data: unreviewed, error } = await supabase
      .from("matches")
      .select("id")
      .eq("status", "completed")
      .is("ai_post_match_review", null)
      .not("goals_home", "is", null)
      .order("match_date", { ascending: false })
      .limit(10);

    if (error) throw error;
    if (!unreviewed || unreviewed.length === 0) {
      return new Response(JSON.stringify({ message: "No unreviewed matches", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check that predictions exist for these matches
    const matchIds = unreviewed.map((m: any) => m.id);
    const { data: preds } = await supabase
      .from("predictions")
      .select("match_id")
      .in("match_id", matchIds);

    const predMatchIds = new Set((preds || []).map((p: any) => p.match_id));
    const reviewable = unreviewed.filter((m: any) => predMatchIds.has(m.id));

    let processed = 0;
    let errors = 0;
    const results: any[] = [];

    // Process in batches of 3 with delays
    for (let i = 0; i < Math.min(reviewable.length, 6); i++) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/generate-post-match-review`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ match_id: reviewable[i].id }),
        });

        if (res.ok) {
          const data = await res.json();
          results.push({ match_id: reviewable[i].id, success: true, score: data.accuracy_score });
          processed++;
        } else {
          const status = res.status;
          if (status === 429) {
            // Rate limited — stop processing
            results.push({ match_id: reviewable[i].id, success: false, error: "rate_limited" });
            break;
          }
          errors++;
          results.push({ match_id: reviewable[i].id, success: false, error: `status_${status}` });
        }
      } catch (e) {
        errors++;
        results.push({ match_id: reviewable[i].id, success: false, error: e.message });
      }

      // Delay between requests
      if (i < reviewable.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_unreviewed: unreviewed.length,
      processed,
      errors,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Batch review error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
