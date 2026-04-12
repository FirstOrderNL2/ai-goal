import { createClient } from "npm:@supabase/supabase-js@2";

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
    const { match_id } = await req.json();
    if (!match_id) {
      return new Response(JSON.stringify({ error: "match_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check if recently enriched (within 30 min) — skip if so
    const { data: existing } = await supabase
      .from("match_enrichment")
      .select("enriched_at")
      .eq("match_id", match_id)
      .maybeSingle();

    if (existing?.enriched_at) {
      const age = Date.now() - new Date(existing.enriched_at).getTime();
      if (age < 30 * 60 * 1000) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "recently enriched" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch match + context in parallel
    const [{ data: match }, { data: ctx }, { data: odds }, { data: refereeData }] = await Promise.all([
      supabase
        .from("matches")
        .select("*, home_team:teams!matches_team_home_id_fkey(name), away_team:teams!matches_team_away_id_fkey(name)")
        .eq("id", match_id)
        .single(),
      supabase.from("match_context").select("*").eq("match_id", match_id).maybeSingle(),
      supabase.from("odds").select("*").eq("match_id", match_id).maybeSingle(),
      null as any, // placeholder, filled below
    ]);

    if (!match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch referee data if available
    let refData: any = null;
    if (match.referee) {
      const { data } = await supabase
        .from("referees")
        .select("*")
        .eq("name", match.referee)
        .maybeSingle();
      refData = data;
    }

    const homeTeam = (match as any).home_team?.name || "Home";
    const awayTeam = (match as any).away_team?.name || "Away";
    const sources: string[] = [];

    // ── Signal extraction from existing match_context ──
    let keyPlayerMissingHome = 0;
    let keyPlayerMissingAway = 0;
    let newsSentimentHome = 0;
    let newsSentimentAway = 0;
    let lineupConfirmed = false;
    let formationHome: string | null = null;
    let formationAway: string | null = null;
    let weatherImpact = 0;
    let oddsMovementHome = 0;
    let oddsMovementAway = 0;
    let refereeCardsAvg: number | null = null;

    if (ctx) {
      sources.push("match_context");

      // Count injuries as key player absences
      const injHome = Array.isArray(ctx.injuries_home) ? ctx.injuries_home : [];
      const injAway = Array.isArray(ctx.injuries_away) ? ctx.injuries_away : [];
      keyPlayerMissingHome = injHome.length;
      keyPlayerMissingAway = injAway.length;

      // Add suspensions
      const suspensions = Array.isArray(ctx.suspensions) ? ctx.suspensions : [];
      // Try to attribute suspensions to teams (often unattributed)
      keyPlayerMissingHome += Math.floor(suspensions.length / 2);
      keyPlayerMissingAway += Math.ceil(suspensions.length / 2);

      // Lineup confirmation
      const lineupHome = Array.isArray(ctx.lineup_home) ? ctx.lineup_home : [];
      const lineupAway = Array.isArray(ctx.lineup_away) ? ctx.lineup_away : [];
      lineupConfirmed = lineupHome.length >= 11 && lineupAway.length >= 11;

      // Weather impact scoring
      if (ctx.weather) {
        const w = ctx.weather.toLowerCase();
        if (w.includes("heavy rain") || w.includes("storm") || w.includes("snow")) {
          weatherImpact = 0.8;
        } else if (w.includes("rain") || w.includes("wind") || w.includes("cold")) {
          weatherImpact = 0.4;
        } else if (w.includes("fog") || w.includes("humid")) {
          weatherImpact = 0.2;
        }
      }
    }

    // Referee data
    if (refData) {
      refereeCardsAvg = (refData.yellow_avg || 0) + (refData.red_avg || 0);
      sources.push("referees");
    }

    // ── Firecrawl-based enrichment (max 3 calls, with error handling) ──
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (firecrawlKey) {
      let firecrawlCalls = 0;
      const maxFirecrawlCalls = 3;

      async function searchFirecrawl(query: string): Promise<any[]> {
        if (firecrawlCalls >= maxFirecrawlCalls) return [];
        firecrawlCalls++;
        try {
          const res = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${firecrawlKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query,
              limit: 5,
              scrapeOptions: { formats: ["markdown"] },
            }),
          });
          if (!res.ok) {
            console.error(`Firecrawl search failed: ${res.status}`);
            return [];
          }
          const data = await res.json();
          return data.data || [];
        } catch (e) {
          console.error("Firecrawl error:", e);
          return [];
        }
      }

      // Search 1: Team news & injuries
      const newsResults = await searchFirecrawl(
        `${homeTeam} vs ${awayTeam} team news injuries lineup ${new Date().toISOString().slice(0, 10)}`
      );

      if (newsResults.length > 0) {
        sources.push("firecrawl_news");

        // Use AI to extract sentiment signals
        const lovableKey = Deno.env.get("LOVABLE_API_KEY");
        if (lovableKey) {
          const newsContent = newsResults
            .slice(0, 3)
            .map((r: any) => (r.markdown || r.description || "").slice(0, 500))
            .join("\n---\n");

          try {
            const aiRes = await fetch(
              "https://ai.gateway.lovable.dev/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${lovableKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash-lite",
                  messages: [
                    {
                      role: "system",
                      content: `You are a football data analyst. Extract structured signals from news articles about the match between ${homeTeam} and ${awayTeam}. Return ONLY a JSON object.`,
                    },
                    {
                      role: "user",
                      content: `Analyze these news snippets and extract:\n- sentiment_home: number from -1 (very negative) to 1 (very positive) for ${homeTeam}\n- sentiment_away: number from -1 to 1 for ${awayTeam}\n- additional_missing_home: number of additional key players confirmed missing for ${homeTeam} (beyond what we already know)\n- additional_missing_away: same for ${awayTeam}\n- formation_home: detected formation for ${homeTeam} (e.g. "4-3-3") or null\n- formation_away: detected formation for ${awayTeam} or null\n\nNews:\n${newsContent}`,
                    },
                  ],
                  tools: [
                    {
                      type: "function",
                      function: {
                        name: "extract_signals",
                        description: "Extract match signals from news",
                        parameters: {
                          type: "object",
                          properties: {
                            sentiment_home: { type: "number" },
                            sentiment_away: { type: "number" },
                            additional_missing_home: { type: "integer" },
                            additional_missing_away: { type: "integer" },
                            formation_home: { type: ["string", "null"] },
                            formation_away: { type: ["string", "null"] },
                          },
                          required: [
                            "sentiment_home",
                            "sentiment_away",
                            "additional_missing_home",
                            "additional_missing_away",
                          ],
                        },
                      },
                    },
                  ],
                  tool_choice: {
                    type: "function",
                    function: { name: "extract_signals" },
                  },
                }),
              }
            );

            if (aiRes.ok) {
              const aiData = await aiRes.json();
              const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
              if (toolCall?.function?.arguments) {
                const signals = JSON.parse(toolCall.function.arguments);
                newsSentimentHome = Math.max(-1, Math.min(1, signals.sentiment_home || 0));
                newsSentimentAway = Math.max(-1, Math.min(1, signals.sentiment_away || 0));
                keyPlayerMissingHome += Math.max(0, signals.additional_missing_home || 0);
                keyPlayerMissingAway += Math.max(0, signals.additional_missing_away || 0);
                if (signals.formation_home) formationHome = signals.formation_home;
                if (signals.formation_away) formationAway = signals.formation_away;
                sources.push("ai_sentiment");
              }
            }
          } catch (e) {
            console.error("AI sentiment extraction failed:", e);
          }
        }
      }

      // Search 2: Odds movement (only if we have existing odds to compare)
      if (odds) {
        const oddsResults = await searchFirecrawl(
          `${homeTeam} vs ${awayTeam} odds betting market movement`
        );
        if (oddsResults.length > 0) {
          sources.push("firecrawl_odds");
          // Simple heuristic: check if any text mentions odds shortening/drifting
          const oddsText = oddsResults
            .map((r: any) => (r.markdown || "").toLowerCase())
            .join(" ");
          if (
            oddsText.includes("shorten") ||
            oddsText.includes("backed") ||
            oddsText.includes("money coming")
          ) {
            // Can't determine direction reliably without parsing, set small signal
            oddsMovementHome = -0.1; // odds shortening = more likely
          }
        }
      }
    }

    // ── Upsert enrichment data ──
    const enrichment = {
      match_id,
      key_player_missing_home: keyPlayerMissingHome,
      key_player_missing_away: keyPlayerMissingAway,
      news_sentiment_home: Math.round(newsSentimentHome * 1000) / 1000,
      news_sentiment_away: Math.round(newsSentimentAway * 1000) / 1000,
      lineup_confirmed: lineupConfirmed,
      formation_home: formationHome,
      formation_away: formationAway,
      weather_impact: Math.round(weatherImpact * 1000) / 1000,
      odds_movement_home: oddsMovementHome,
      odds_movement_away: oddsMovementAway,
      referee_cards_avg: refereeCardsAvg,
      social_sentiment: 0,
      enriched_at: new Date().toISOString(),
      sources,
    };

    const { error: upsertErr } = await supabase
      .from("match_enrichment")
      .upsert(enrichment, { onConflict: "match_id" });

    if (upsertErr) {
      console.error("Enrichment upsert error:", upsertErr);
      throw upsertErr;
    }

    return new Response(
      JSON.stringify({ success: true, match_id, enrichment }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Enrichment error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Enrichment failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
