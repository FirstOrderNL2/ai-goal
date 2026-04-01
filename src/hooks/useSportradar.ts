import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

async function srProxy(path: string) {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `https://${projectId}.supabase.co/functions/v1/get-sportradar-data?path=${encodeURIComponent(path)}`;
  
  const res = await fetch(url, {
    headers: {
      "apikey": anonKey,
      "Authorization": `Bearer ${anonKey}`,
    },
  });
  if (!res.ok) throw new Error(`Sportradar proxy error: ${res.status}`);
  return res.json();
}

export function useSportradarData(path: string | null, enabled = true) {
  return useQuery({
    queryKey: ["sportradar", path],
    queryFn: () => srProxy(path!),
    enabled: !!path && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useFunFacts(sportradarEventId: string | null | undefined) {
  const path = sportradarEventId
    ? `/sport_events/${sportradarEventId}/fun_facts.json`
    : null;
  return useSportradarData(path, !!sportradarEventId);
}

export function useMatchInsights(sportradarEventId: string | null | undefined) {
  const path = sportradarEventId
    ? `/sport_events/${sportradarEventId}/insights.json`
    : null;
  return useSportradarData(path, !!sportradarEventId);
}

export function useStandings(seasonId: string | null) {
  const path = seasonId ? `/seasons/${seasonId}/standings.json` : null;
  return useSportradarData(path, !!seasonId);
}

export function useSportradarH2H(
  competitorId1: string | null | undefined,
  competitorId2: string | null | undefined
) {
  const path =
    competitorId1 && competitorId2
      ? `/competitors/${competitorId1}/versus/${competitorId2}/summaries.json`
      : null;
  return useSportradarData(path, !!competitorId1 && !!competitorId2);
}

const LEAGUE_KEYS = ["premier_league", "la_liga", "serie_a", "bundesliga", "ligue_1", "wc_qualifiers_europe", "wc_qualifiers_conmebol", "wc_qualifiers_concacaf", "world_cup_2026"];

export function useSyncSportradarData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const combinedSummary = { teamsCreated: 0, teamsMatched: 0, matchesCreated: 0, matchesMatched: 0, probabilitiesSynced: 0, errors: [] as string[] };

      // Sync one league at a time to avoid timeouts
      for (const key of LEAGUE_KEYS) {
        try {
          const url = `https://${projectId}.supabase.co/functions/v1/sync-sportradar-data?league=${key}`;
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "apikey": anonKey,
              "Authorization": `Bearer ${anonKey}`,
              "Content-Type": "application/json",
            },
          });
          if (!res.ok) {
            combinedSummary.errors.push(`${key}: HTTP ${res.status}`);
            continue;
          }
          const data = await res.json();
          if (data.summary) {
            combinedSummary.teamsCreated += data.summary.teamsCreated || 0;
            combinedSummary.teamsMatched += data.summary.teamsMatched || 0;
            combinedSummary.matchesCreated += data.summary.matchesCreated || 0;
            combinedSummary.matchesMatched += data.summary.matchesMatched || 0;
            combinedSummary.probabilitiesSynced += data.summary.probabilitiesSynced || 0;
            if (data.summary.errors?.length) combinedSummary.errors.push(...data.summary.errors);
          }
        } catch (e: any) {
          combinedSummary.errors.push(`${key}: ${e.message}`);
        }
      }

      return { summary: combinedSummary };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}
