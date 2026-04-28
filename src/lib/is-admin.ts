// Lightweight admin check.
// We don't have a `user_roles` table yet (TODO: long-term fix is RLS-enforced roles).
// For now, gate ops/admin UI behind an env-driven email allowlist so non-admin
// users no longer see sync / backfill / recompute buttons on public pages.
//
// Set VITE_ADMIN_EMAILS to a comma-separated list of admin emails in the env.
import type { User } from "@supabase/supabase-js";

const RAW = (import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? "";
const ADMIN_EMAILS = RAW.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export function isAdmin(user: User | null | undefined): boolean {
  if (!user?.email) return false;
  if (ADMIN_EMAILS.length === 0) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}
