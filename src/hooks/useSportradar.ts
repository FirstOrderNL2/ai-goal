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

export function useSyncSportradarData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-sportradar-data");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}
