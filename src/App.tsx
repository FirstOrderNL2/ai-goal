import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useParams, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supportedLangs, type SupportedLang } from "@/i18n";
import "@/i18n";

import Landing from "./pages/Landing";
import Index from "./pages/Index";
import MatchDetail from "./pages/MatchDetail";
import Accuracy from "./pages/Accuracy";
import Teams from "./pages/Teams";
import TeamDetail from "./pages/TeamDetail";
import StatsBomb from "./pages/StatsBomb";
import Standings from "./pages/Standings";
import Profile from "./pages/Profile";
import Leaderboard from "./pages/Leaderboard";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import Upgrade from "./pages/Upgrade";
import UpgradeSuccess from "./pages/UpgradeSuccess";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 3000,
      refetchOnWindowFocus: false,
      networkMode: "online",
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const { lang } = useParams<{ lang: string }>();
  const location = useLocation();
  const prefix = lang && supportedLangs.includes(lang as SupportedLang) ? `/${lang}` : "/en";

  if (loading) return <div className="min-h-screen bg-background" />;
  if (!session) {
    const currentPath = location.pathname + location.search;
    return <Navigate to={`${prefix}/login?redirect=${encodeURIComponent(currentPath)}`} replace />;
  }
  return <>{children}</>;
}

function LocaleSync({ children }: { children: React.ReactNode }) {
  const { lang } = useParams<{ lang: string }>();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (lang && supportedLangs.includes(lang as SupportedLang) && i18n.language !== lang) {
      i18n.changeLanguage(lang);
      localStorage.setItem("goalgpt-lang", lang);
    }
  }, [lang, i18n]);

  return <>{children}</>;
}

function RootRedirect() {
  const { session, loading } = useAuth();

  if (loading) return <div className="min-h-screen bg-background" />;

  const stored = localStorage.getItem("goalgpt-lang");
  const browserLang = navigator.language?.split("-")[0];
  const target = stored && supportedLangs.includes(stored as SupportedLang)
    ? stored
    : supportedLangs.includes(browserLang as SupportedLang) ? browserLang : "en";

  if (session) {
    return <Navigate to={`/${target}/dashboard`} replace />;
  }
  return <Navigate to={`/${target}`} replace />;
}

function InvalidLangRedirect() {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/[^/]+/, "");
  return <Navigate to={`/en${rest || "/"}${location.search}`} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/:lang/*" element={<LangRoutes />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

function LangRoutes() {
  const { lang } = useParams<{ lang: string }>();

  if (!lang || !supportedLangs.includes(lang as SupportedLang)) {
    return <InvalidLangRedirect />;
  }

  return (
    <LocaleSync>
      <Routes>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="auth/callback" element={<AuthCallback />} />
        <Route path="dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="match/:id" element={<ProtectedRoute><MatchDetail /></ProtectedRoute>} />
        <Route path="accuracy" element={<ProtectedRoute><Accuracy /></ProtectedRoute>} />
        <Route path="teams" element={<ProtectedRoute><Teams /></ProtectedRoute>} />
        <Route path="teams/:id" element={<ProtectedRoute><TeamDetail /></ProtectedRoute>} />
        <Route path="statsbomb" element={<ProtectedRoute><StatsBomb /></ProtectedRoute>} />
        <Route path="standings" element={<ProtectedRoute><Standings /></ProtectedRoute>} />
        <Route path="leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
        <Route path="profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="upgrade" element={<ProtectedRoute><Upgrade /></ProtectedRoute>} />
        <Route path="upgrade/success" element={<ProtectedRoute><UpgradeSuccess /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </LocaleSync>
  );
}

export default App;
