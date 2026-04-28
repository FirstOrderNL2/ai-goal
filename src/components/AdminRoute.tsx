import { useEffect, useState } from "react";
import { Navigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { supportedLangs, type SupportedLang } from "@/i18n";

/**
 * AdminRoute: like ProtectedRoute, but additionally requires the signed-in
 * user to be flagged as admin (via the `is-admin` edge function, which checks
 * both the ADMIN_USER_IDS env allow-list and the admin_users table).
 */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const { lang } = useParams<{ lang: string }>();
  const location = useLocation();
  const prefix =
    lang && supportedLangs.includes(lang as SupportedLang) ? `/${lang}` : "/en";

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session?.user) {
        if (!cancelled) setIsAdmin(false);
        return;
      }
      // Query the admin_users table directly. RLS allows admins to view it,
      // so a returned row proves admin status; no row = not admin.
      const { data, error } = await supabase
        .from("admin_users")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!cancelled) setIsAdmin(!error && !!data);
    })();
    return () => { cancelled = true; };
  }, [session]);

  if (authLoading || isAdmin === null) {
    return <div className="min-h-screen bg-background" />;
  }
  if (!session) {
    const currentPath = location.pathname + location.search;
    return <Navigate to={`${prefix}/login?redirect=${encodeURIComponent(currentPath)}`} replace />;
  }
  if (!isAdmin) {
    return <Navigate to={`${prefix}/dashboard`} replace />;
  }
  return <>{children}</>;
}
