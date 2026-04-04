import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function fetchFromProxy(endpoint: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams({ endpoint, ...params });
  const url = `${SUPABASE_URL}/functions/v1/get-football-data?${searchParams.toString()}`;
  const res = await fetch(url, {
    headers: {
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export interface LineupPlayer {
  name: string;
  number: number | null;
  pos: string | null;
}

export interface TeamLineup {
  team: string;
  formation: string;
  starters: LineupPlayer[];
  bench: LineupPlayer[];
}

export interface MatchEvent {
  time: { elapsed: number; extra: number | null };
  team: { name: string; logo: string | null };
  player: { name: string };
  assist: { name: string | null };
  type: string;
  detail: string;
}

export interface LiveFixture {
  fixture: {
    id: number;
    status: { long: string; short: string; elapsed: number | null };
  };
  goals: { home: number | null; away: number | null };
  teams: {
    home: { name: string; logo: string };
    away: { name: string; logo: string };
  };
}

export function useLineups(apiFootballId: number | null | undefined) {
  return useQuery({
    queryKey: ["lineups", apiFootballId],
    queryFn: async (): Promise<{ home: TeamLineup | null; away: TeamLineup | null }> => {
      if (!apiFootballId) return { home: null, away: null };
      const data = await fetchFromProxy("/fixtures/lineups", { fixture: String(apiFootballId) });
      const response = data.response ?? [];
      if (response.length === 0) return { home: null, away: null };

      const mapLineup = (l: any): TeamLineup => ({
        team: l.team?.name ?? "Unknown",
        formation: l.formation ?? "?",
        starters: (l.startXI ?? []).map((p: any) => ({
          name: p.player?.name ?? "?",
          number: p.player?.number ?? null,
          pos: p.player?.pos ?? null,
        })),
        bench: (l.substitutes ?? []).map((p: any) => ({
          name: p.player?.name ?? "?",
          number: p.player?.number ?? null,
          pos: p.player?.pos ?? null,
        })),
      });

      return {
        home: response[0] ? mapLineup(response[0]) : null,
        away: response[1] ? mapLineup(response[1]) : null,
      };
    },
    enabled: !!apiFootballId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLiveFixture(apiFootballId: number | null | undefined, matchStatus?: string) {
  const isLive = matchStatus === "live" || matchStatus === "1H" || matchStatus === "2H" || matchStatus === "HT";
  return useQuery({
    queryKey: ["live-fixture", apiFootballId],
    queryFn: async (): Promise<LiveFixture | null> => {
      if (!apiFootballId) return null;
      const data = await fetchFromProxy("/fixtures", { id: String(apiFootballId) });
      const response = data.response ?? [];
      return response[0] ?? null;
    },
    enabled: !!apiFootballId,
    refetchInterval: (query) => query.state.error ? false : (isLive ? 5_000 : false),
    staleTime: isLive ? 3_000 : 5 * 60 * 1000,
  });
}

export function useFixtureEvents(apiFootballId: number | null | undefined, matchStatus?: string) {
  const isLive = matchStatus === "live" || matchStatus === "1H" || matchStatus === "2H" || matchStatus === "HT";
  return useQuery({
    queryKey: ["fixture-events", apiFootballId],
    queryFn: async (): Promise<MatchEvent[]> => {
      if (!apiFootballId) return [];
      const data = await fetchFromProxy("/fixtures/events", { fixture: String(apiFootballId) });
      return data.response ?? [];
    },
    enabled: !!apiFootballId,
    refetchInterval: (query) => query.state.error ? false : (isLive ? 5_000 : false),
    staleTime: isLive ? 3_000 : 5 * 60 * 1000,
  });
}
