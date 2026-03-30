const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "https://api.sportmonks.com/v3/football";

const allowedPatterns = [
  /^\/standings\/seasons\/\d+$/,
  /^\/schedules\/teams\/\d+$/,
  /^\/rounds\/\d+$/,
  /^\/fixtures\/\d+$/,
  /^\/seasons\/\d+$/,
  /^\/leagues$/,
  /^\/seasons$/,
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("SPORTMONKS_API_KEY");
    if (!apiKey) throw new Error("SPORTMONKS_API_KEY not set");

    const url = new URL(req.url);
    const endpoint = url.searchParams.get("endpoint");

    if (!endpoint) {
      return new Response(JSON.stringify({ error: "Missing endpoint param" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!allowedPatterns.some((p) => p.test(endpoint))) {
      return new Response(JSON.stringify({ error: "Endpoint not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Forward extra query params (like include, filters)
    const params = new URLSearchParams();
    for (const [key, value] of url.searchParams.entries()) {
      if (key !== "endpoint") params.set(key, value);
    }
    params.set("api_token", apiKey);

    const apiUrl = `${BASE_URL}${endpoint}?${params.toString()}`;
    const res = await fetch(apiUrl);
    const data = await res.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sportmonks proxy error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
