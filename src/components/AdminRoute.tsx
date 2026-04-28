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

  const [adminCheck, setAdminCheck] = useState<{ userId: string | null; isAdmin: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (authLoading) {
      setAdminCheck(null);
      return () => { cancelled = true; };
    }

    (async () => {
      if (!session?.user) {
        if (!cancelled) setAdminCheck({ userId: null, isAdmin: false });
        return;
      }

      const userId = session.user.id;
      setAdminCheck(null);

      // Query the admin_users table directly. RLS allows admins to view it,
      // so a returned row proves admin status; no row = not admin.
      const { data, error } = await supabase
        .from("admin_users")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!cancelled) setAdminCheck({ userId, isAdmin: !error && !!data });
    })();

    return () => { cancelled = true; };
  }, [authLoading, session?.user?.id]);

  const userId = session?.user?.id ?? null;
  const adminCheckIsCurrent = adminCheck?.userId === userId;

  if (authLoading || !adminCheckIsCurrent) {
    return <div className="min-h-screen bg-background" />;
  }
  if (!session) {
    const currentPath = location.pathname + location.search;
    return <Navigate to={`${prefix}/login?redirect=${encodeURIComponent(currentPath)}`} replace />;
  }
  if (!adminCheck.isAdmin) {
    return <Navigate to={`${prefix}/dashboard`} replace />;
  }
  return <>{children}</>;
}
