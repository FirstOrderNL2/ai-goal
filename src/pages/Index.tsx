import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { MatchCard } from "@/components/MatchCard";
import { LeagueFilter } from "@/components/LeagueFilter";
import { useDashboardMatches, useCompletedMatches } from "@/hooks/useMatches";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Clock, Flame } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

const HEAL_COOLDOWN_MS = 2 * 60 * 1000;

const Index = () => {
  const [league, setLeague] = useState("all");
  const queryClient = useQueryClient();
  const lastHealRef = useRef(0);
  const { t } = useTranslation();

  const { data: dashboard, isLoading: loadingDash } = useDashboardMatches(league);
  const { data: completed, isLoading: loadingDone } = useCompletedMatches(league);

  const live = dashboard?.live ?? [];
  const upcoming = dashboard?.upcoming ?? [];
  const transitionIds = dashboard?.transitionIds ?? [];

  useEffect(() => {
    if (transitionIds.length === 0) return;
    const now = Date.now();
    if (now - lastHealRef.current < HEAL_COOLDOWN_MS) return;
    lastHealRef.current = now;

    supabase.functions.invoke("auto-sync", { body: { mode: "live" } })
      .then(() => {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["matches"] });
        }, 3000);
      })
      .catch(() => {});
  }, [transitionIds, queryClient]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t("dashboard.title_1")} <span className="text-primary">{t("dashboard.title_2")}</span>
          </h1>
          <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>

        <LeagueFilter selected={league} onChange={setLeague} />

        {(loadingDash || live.length > 0) && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
              <h2 className="text-lg font-semibold">{t("dashboard.live_matches")}</h2>
              {!loadingDash && <span className="text-xs text-muted-foreground">({live.length})</span>}
            </div>
            {loadingDash ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-lg" />)}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {live.map((m) => <MatchCard key={m.id} match={m} />)}
              </div>
            )}
          </section>
        )}

        {(() => {
          const hot = upcoming.filter((m) => (m.hotScore ?? 0) >= 10).sort((a, b) => (b.hotScore ?? 0) - (a.hotScore ?? 0)).slice(0, 6);
          if (hot.length === 0) return null;
          return (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-400" />
                <h2 className="text-lg font-semibold">{t("dashboard.trending_matches")}</h2>
                <span className="text-xs text-muted-foreground">({hot.length})</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {hot.map((m) => <MatchCard key={m.id} match={m} />)}
              </div>
            </section>
          );
        })()}

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">{t("dashboard.upcoming_matches")}</h2>
            {!loadingDash && upcoming && <span className="text-xs text-muted-foreground">({upcoming.length})</span>}
          </div>
          {loadingDash ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-lg" />)}
            </div>
          ) : upcoming.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((m) => <MatchCard key={m.id} match={m} />)}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("dashboard.no_upcoming")}</p>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">{t("dashboard.recent_results")}</h2>
          </div>
          {loadingDone ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-lg" />)}
            </div>
          ) : completed?.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {completed.slice(0, 6).map((m) => <MatchCard key={m.id} match={m} />)}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("dashboard.no_recent")}</p>
          )}
        </section>
      </main>
    </div>
  );
};

export default Index;
