// Phase 4.5: is-admin
// Tiny endpoint the admin UI calls to know whether the current signed-in user
// can see /admin/models actions. Returns { is_admin: boolean }.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(JSON.stringify({ is_admin: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: userRes, error } = await admin.auth.getUser(token);
  if (error || !userRes?.user) {
    return new Response(JSON.stringify({ is_admin: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userRes.user.id;

  // Check both: env allow-list AND admin_users table.
  const allowList = (Deno.env.get("ADMIN_USER_IDS") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (allowList.includes(userId)) {
    return new Response(JSON.stringify({ is_admin: true, source: "env" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: row } = await admin
    .from("admin_users")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  return new Response(JSON.stringify({ is_admin: !!row, source: row ? "table" : "none" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
