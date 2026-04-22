import { createClient } from "npm:@supabase/supabase-js@2";
import { checkAccess } from "../_shared/access-guard.ts";

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
    const { match_id, system: systemCall } = await req.json();
    if (!systemCall) {
      const access = await checkAccess(req);
      if (!access.ok) {
        return new Response(JSON.stringify({ error: access.message }), {
          status: access.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    if (!match_id) {
      return new Response(JSON.stringify({ error: "match_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check cache — refuse if frozen (Priority 1), else 30-min soft cache.
    const { data: existing } = await supabase
      .from("match_intelligence")
      .select("generated_at, frozen_at")
      .eq("match_id", match_id)
      .maybeSingle();

    if (existing?.frozen_at) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "row frozen (post-kickoff immutable)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existing?.generated_at) {
      const age = Date.now() - new Date(existing.generated_at).getTime();
      if (age < 30 * 60 * 1000) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "recently generated" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch all data in parallel
    const [
      { data: match },
      { data: ctx },
      { data: enrichment },
      { data: features },
      { data: odds },
      { data: prediction },
    ] = await Promise.all([
      supabase
        .from("matches")
        .select("*, home_team:teams!matches_team_home_id_fkey(name, logo_url), away_team:teams!matches_team_away_id_fkey(name, logo_url)")
        .eq("id", match_id)
        .single(),
      supabase.from("match_context").select("*").eq("match_id", match_id).maybeSingle(),
      supabase.from("match_enrichment").select("*").eq("match_id", match_id).maybeSingle(),
      supabase.from("match_features").select("*").eq("match_id", match_id).maybeSingle(),
      supabase.from("odds").select("*").eq("match_id", match_id).maybeSingle(),
      supabase.from("predictions").select("home_win, draw, away_win, expected_goals_home, expected_goals_away").eq("match_id", match_id).maybeSingle(),
    ]);

    if (!match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Hard reject post-kickoff writes when no pre-match freeze exists.
    // Prevents temporal leakage from late-arriving intelligence overwriting training snapshots.
    const matchDateMs = new Date((match as any).match_date).getTime();
    if (Date.now() > matchDateMs && !existing?.frozen_at) {
      if (existing) {
        await supabase
          .from("match_intelligence")
          .update({
            frozen_at: new Date().toISOString(),
            frozen_for_match_date: (match as any).match_date,
          })
          .eq("match_id", match_id);
      }
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "post-kickoff, refusing late write" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const homeName = (match as any).home_team?.name || "Home";
    const awayName = (match as any).away_team?.name || "Away";

    // Fetch recent form (last 10 matches per team)
    const [{ data: homeForm }, { data: awayForm }] = await Promise.all([
      supabase
        .from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .or(`team_home_id.eq.${match.team_home_id},team_away_id.eq.${match.team_home_id}`)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(10),
      supabase
        .from("matches")
        .select("goals_home, goals_away, team_home_id, team_away_id")
        .or(`team_home_id.eq.${match.team_away_id},team_away_id.eq.${match.team_away_id}`)
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(10),
    ]);

    // Build form strings
    function formString(matches: any[], teamId: string): string {
      return (matches || []).slice(0, 5).map((m: any) => {
        const isHome = m.team_home_id === teamId;
        const gf = isHome ? (m.goals_home ?? 0) : (m.goals_away ?? 0);
        const ga = isHome ? (m.goals_away ?? 0) : (m.goals_home ?? 0);
        return gf > ga ? "W" : gf === ga ? "D" : "L";
      }).join("");
    }

    const homeFormStr = formString(homeForm || [], match.team_home_id);
    const awayFormStr = formString(awayForm || [], match.team_away_id);

    // ── Deterministic market signal ──
    let marketSignal: any = { alignment: "unknown", upset_probability: 0 };
    if (odds && prediction) {
      const impliedHome = (1 / odds.home_win_odds);
      const impliedDraw = (1 / odds.draw_odds);
      const impliedAway = (1 / odds.away_win_odds);
      const totalImpl = impliedHome + impliedDraw + impliedAway;
      const iH = impliedHome / totalImpl;
      const iD = impliedDraw / totalImpl;
      const iA = impliedAway / totalImpl;

      const maxDelta = Math.max(
        Math.abs(Number(prediction.home_win) - iH),
        Math.abs(Number(prediction.draw) - iD),
        Math.abs(Number(prediction.away_win) - iA)
      );

      if (maxDelta < 0.05) marketSignal.alignment = "strong_agree";
      else if (maxDelta < 0.10) marketSignal.alignment = "agree";
      else if (maxDelta < 0.15) marketSignal.alignment = "slight_diverge";
      else marketSignal.alignment = "strong_diverge";

      // Upset probability: if underdog (by odds) has >30% model probability
      const favorite = iH > iA ? "home" : "away";
      const underdogProb = favorite === "home" ? Number(prediction.away_win) : Number(prediction.home_win);
      marketSignal.upset_probability = Math.round(underdogProb * 100);
      marketSignal.model_vs_market_delta = Math.round(maxDelta * 100);
    }

    // ── Build AI prompt for FIL report ──
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return new Response(
        JSON.stringify({ error: "AI gateway not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compile all available data into a context block
    let dataBlock = `Match: ${homeName} vs ${awayName}
League: ${match.league}
Competition Type: ${(match as any).competition_type || "league"}
Match Stage: ${(match as any).match_stage || "regular"}
Match Importance: ${(match as any).match_importance || 0.5}/1.0
Date: ${match.match_date}
Round: ${match.round || "N/A"}
Referee: ${match.referee || "Unknown"}

FORM (last 5):
${homeName}: ${homeFormStr || "N/A"}
${awayName}: ${awayFormStr || "N/A"}`;

    if (features) {
      dataBlock += `\n\nFEATURES:
Home avg scored: ${features.home_avg_scored}, conceded: ${features.home_avg_conceded}
Away avg scored: ${features.away_avg_scored}, conceded: ${features.away_avg_conceded}
Home clean sheet %: ${features.home_clean_sheet_pct}, Away: ${features.away_clean_sheet_pct}
Home BTTS %: ${features.home_btts_pct}, Away: ${features.away_btts_pct}
League position home: ${features.league_position_home || "?"}, away: ${features.league_position_away || "?"}
Position diff: ${features.position_diff || 0}`;
    }

    if (enrichment) {
      dataBlock += `\n\nENRICHMENT SIGNALS:
Key players missing: ${homeName} ${enrichment.key_player_missing_home || 0}, ${awayName} ${enrichment.key_player_missing_away || 0}
News sentiment: ${homeName} ${enrichment.news_sentiment_home || 0}, ${awayName} ${enrichment.news_sentiment_away || 0}
Weather impact: ${enrichment.weather_impact || 0}
Formations: ${enrichment.formation_home || "?"} vs ${enrichment.formation_away || "?"}
Lineup confirmed: ${enrichment.lineup_confirmed ? "Yes" : "No"}`;
    }

    if (ctx) {
      const injHome = Array.isArray(ctx.injuries_home) ? ctx.injuries_home : [];
      const injAway = Array.isArray(ctx.injuries_away) ? ctx.injuries_away : [];
      if (injHome.length > 0 || injAway.length > 0) {
        dataBlock += `\n\nINJURIES:`;
        if (injHome.length > 0) dataBlock += `\n${homeName}: ${injHome.map((i: any) => `${i.player || i.name} (${i.reason || i.type})`).join(", ")}`;
        if (injAway.length > 0) dataBlock += `\n${awayName}: ${injAway.map((i: any) => `${i.player || i.name} (${i.reason || i.type})`).join(", ")}`;
      }
      if (ctx.weather) dataBlock += `\nWeather: ${ctx.weather}`;
      const news = Array.isArray(ctx.news_items) ? ctx.news_items : [];
      if (news.length > 0) {
        dataBlock += `\n\nNEWS HEADLINES:\n${news.slice(0, 5).map((n: any) => `- ${n.title || n.headline || n}`).join("\n")}`;
      }
    }

    if (odds) {
      dataBlock += `\n\nODDS: Home ${odds.home_win_odds}, Draw ${odds.draw_odds}, Away ${odds.away_win_odds}`;
    }

    if (prediction) {
      dataBlock += `\n\nCURRENT PREDICTION:
1X2: Home ${Math.round(Number(prediction.home_win) * 100)}%, Draw ${Math.round(Number(prediction.draw) * 100)}%, Away ${Math.round(Number(prediction.away_win) * 100)}%
xG: ${prediction.expected_goals_home} - ${prediction.expected_goals_away}`;
    }

    // Call AI for structured FIL report via tool calling
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a world-class football intelligence analyst. Given match data, generate a structured Football Intelligence Layer (FIL) report. You must analyze like a seasoned football pundit who understands tactics, momentum, player importance, and match psychology. Be specific and data-driven.`,
          },
          {
            role: "user",
            content: `Analyze this match and generate the FIL report:\n\n${dataBlock}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_fil_report",
              description: "Generate structured Football Intelligence Layer report",
              parameters: {
                type: "object",
                properties: {
                  player_impacts: {
                    type: "array",
                    description: "Key players affecting the match (injured, suspended, returning, or crucial)",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        team: { type: "string", enum: ["home", "away"] },
                        importance: { type: "integer", description: "0-100, how crucial this player is" },
                        status: { type: "string", enum: ["injured", "suspended", "doubtful", "returning", "key_starter"] },
                        impact_description: { type: "string", description: "How this affects the match" },
                      },
                      required: ["name", "team", "importance", "status", "impact_description"],
                    },
                  },
                  tactical_analysis: {
                    type: "object",
                    properties: {
                      formation_home: { type: "string" },
                      formation_away: { type: "string" },
                      tactical_advantage: { type: "string", enum: ["home", "away", "neutral"] },
                      advantage_score: { type: "integer", description: "0-100" },
                      style_matchup: { type: "string", description: "Brief tactical matchup analysis" },
                    },
                    required: ["tactical_advantage", "advantage_score", "style_matchup"],
                  },
                  momentum_home: { type: "integer", description: "0-100 momentum score for home team" },
                  momentum_away: { type: "integer", description: "0-100 momentum score for away team" },
                  match_narrative: { type: "string", description: "2-3 sentence football story explaining the match situation" },
                  context_summary: { type: "string", description: "One sentence summary of key factors" },
                  confidence_adjustment: { type: "number", description: "Delta between -0.1 and 0.1 to adjust prediction confidence based on contextual evidence" },
                },
                required: ["player_impacts", "tactical_analysis", "momentum_home", "momentum_away", "match_narrative", "context_summary", "confidence_adjustment"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_fil_report" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);

      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response");
      return new Response(JSON.stringify({ error: "AI did not produce structured output" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fil = JSON.parse(toolCall.function.arguments);

    // Clamp confidence adjustment
    const confAdj = Math.max(-0.1, Math.min(0.1, fil.confidence_adjustment || 0));

    // Upsert into match_intelligence — freeze if still pre-match.
    const nowMs = Date.now();
    const matchTs = (match as any).match_date ? new Date((match as any).match_date).getTime() : nowMs;
    const isPreMatch = nowMs < matchTs;
    const intelRow: Record<string, unknown> = {
      match_id,
      player_impacts: fil.player_impacts || [],
      tactical_analysis: fil.tactical_analysis || {},
      momentum_home: Math.max(0, Math.min(100, fil.momentum_home || 50)),
      momentum_away: Math.max(0, Math.min(100, fil.momentum_away || 50)),
      market_signal: marketSignal,
      match_narrative: fil.match_narrative || null,
      context_summary: fil.context_summary || null,
      confidence_adjustment: Math.round(confAdj * 1000) / 1000,
      generated_at: new Date().toISOString(),
    };
    if (isPreMatch) {
      intelRow.frozen_at = new Date().toISOString();
      intelRow.frozen_for_match_date = (match as any).match_date;
    }
    const { error: upsertErr } = await supabase
      .from("match_intelligence")
      .upsert(intelRow, { onConflict: "match_id" });

    if (upsertErr) {
      console.error("Upsert error:", upsertErr);
      throw upsertErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        match_id,
        market_signal: marketSignal,
        momentum: { home: fil.momentum_home, away: fil.momentum_away },
        confidence_adjustment: confAdj,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Football intelligence error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Intelligence generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
