// Phase 5: shared admin guard for internal endpoints.
// Returns null if request is authorized (admin or service role), or a Response to return.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-admin-secret",
};

/**
 * requireAdmin: allow either
 *   - service-role key in Authorization header (cron / server-to-server), or
 *   - signed-in user whose user_id is in admin_users (if such a table exists),
 *   - or, as a fallback, signed-in user listed in ADMIN_USER_IDS env (comma-separated UUIDs).
 *
 * Public/anon traffic is rejected.
 */
export async function requireAdmin(req: Request): Promise<{ ok: true } | { ok: false; resp: Response }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  // Service role short-circuit (used by auto-sync / cron).
  if (token && token === SERVICE_ROLE) return { ok: true };

  if (!token) {
    return {
      ok: false,
      resp: new Response(JSON.stringify({ error: "missing_authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  // Verify the JWT and resolve user.
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: userRes, error } = await userClient.auth.getUser(token);
  if (error || !userRes?.user) {
    return {
      ok: false,
      resp: new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const userId = userRes.user.id;
  const allowList = (Deno.env.get("ADMIN_USER_IDS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowList.includes(userId)) return { ok: true };

  return {
    ok: false,
    resp: new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  };
}
