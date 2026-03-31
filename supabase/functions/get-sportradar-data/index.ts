import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "https://api.sportradar.com/soccer/trial/v4/en";
const EXTENDED_URL = "https://api.sportradar.com/soccer-extended/trial/v4/en";

// Whitelist patterns (regex)
const allowedPatterns = [
  /^\/competitions\.json$/,
  /^\/competitions\/sr:competition:\d+\/seasons\.json$/,
  /^\/seasons\/sr:season:\d+\/schedules\.json$/,
  /^\/seasons\/sr:season:\d+\/probabilities\.json$/,
  /^\/seasons\/sr:season:\d+\/standings\.json$/,
  /^\/seasons\/sr:season:\d+\/over_under_statistics\.json$/,
  /^\/sport_events\/sr:sport_event:\d+\/summary\.json$/,
  /^\/sport_events\/sr:sport_event:\d+\/fun_facts\.json$/,
  /^\/sport_events\/sr:sport_event:\d+\/lineups\.json$/,
  /^\/competitors\/sr:competitor:\d+\/versus\/sr:competitor:\d+\/summaries\.json$/,
  /^\/competitors\/sr:competitor:\d+\/profile\.json$/,
];

const extendedPatterns = [
  /^\/sport_events\/sr:sport_event:\d+\/extended_summary\.json$/,
  /^\/sport_events\/sr:sport_event:\d+\/insights\.json$/,
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("SPORTRADAR_API_KEY");
    if (!apiKey) throw new Error("SPORTRADAR_API_KEY not set");

    const url = new URL(req.url);
    const path = url.searchParams.get("path");

    if (!path) {
      return new Response(JSON.stringify({ error: "Missing path param" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if it's an extended endpoint
    const isExtended = extendedPatterns.some((p) => p.test(path));
    const isBase = allowedPatterns.some((p) => p.test(path));

    if (!isBase && !isExtended) {
      return new Response(JSON.stringify({ error: "Path not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = isExtended ? EXTENDED_URL : BASE_URL;
    const apiUrl = `${baseUrl}${path}?api_key=${apiKey}`;

    const res = await fetch(apiUrl);
    const data = await res.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sportradar proxy error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
