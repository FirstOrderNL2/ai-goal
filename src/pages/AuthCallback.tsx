import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supportedLangs, type SupportedLang } from "@/i18n";

export default function AuthCallback() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { lang } = useParams<{ lang: string }>();
  const [searchParams] = useSearchParams();

  const prefix = lang && supportedLangs.includes(lang as SupportedLang) ? `/${lang}` : "/en";

  useEffect(() => {
    if (loading) return;

    const redirect = searchParams.get("redirect");

    if (session) {
      navigate(redirect || `${prefix}/dashboard`, { replace: true });
    } else {
      navigate(`${prefix}/login`, { replace: true });
    }
  }, [session, loading, navigate, prefix, searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground text-sm">Signing you in…</p>
      </div>
    </div>
  );
}
