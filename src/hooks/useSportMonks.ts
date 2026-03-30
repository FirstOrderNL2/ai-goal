import { useQuery } from "@tanstack/react-query";

async function smProxy(endpoint: string, params?: Record<string, string>) {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const qs = new URLSearchParams({ endpoint, ...params });
  const url = `https://${projectId}.supabase.co/functions/v1/get-sportmonks-data?${qs.toString()}`;

  const res = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });
  if (!res.ok) throw new Error(`SportMonks proxy error: ${res.status}`);
  return res.json();
}

export function useSportMonksData(
  endpoint: string | null,
  params?: Record<string, string>,
  enabled = true
) {
  return useQuery({
    queryKey: ["sportmonks", endpoint, params],
    queryFn: () => smProxy(endpoint!, params),
    enabled: !!endpoint && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSportMonksStandings(seasonId: number | null) {
  return useSportMonksData(
    seasonId ? `/standings/seasons/${seasonId}` : null,
    { include: "participant;details" },
    !!seasonId
  );
}

export function useSportMonksSchedule(teamId: number | null) {
  return useSportMonksData(
    teamId ? `/schedules/teams/${teamId}` : null,
    {},
    !!teamId
  );
}
