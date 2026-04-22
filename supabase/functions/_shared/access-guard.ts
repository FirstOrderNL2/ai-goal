import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Returns { ok: true } if user has access (trial valid OR active subscription),
 * otherwise { ok: false, status: 401|403, message }.
 *
 * Reads the Authorization bearer token from the request, resolves the user,
 * then checks the public.has_access() RPC.
 */
export async function checkAccess(req: Request): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string }
> {
  const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authHeader) return { ok: false, status: 401, message: "Missing auth token" };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error } = await supabase.auth.getUser(authHeader);
  if (error || !user) return { ok: false, status: 401, message: "Unauthorized" };

  const { data: hasAccess } = await supabase.rpc("has_access", { _user_id: user.id });
  if (!hasAccess) {
    return { ok: false, status: 403, message: "Subscription required. Trial expired or not active." };
  }

  return { ok: true, userId: user.id };
}
