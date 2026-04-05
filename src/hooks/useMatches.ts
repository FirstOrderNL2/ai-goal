import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Match, Team, Prediction, Odds, MatchFeatures, Player } from "@/lib/types";

export function useUpcomingMatches(league?: string) {
  return useQuery({
    queryKey: ["matches", "upcoming", league],
    refetchInterval: (query) => query.state.error ? false : 5 * 60 * 1000,
    queryFn: async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      let query = supabase
        .from("matches")
        .select("*")
        .eq("status", "upcoming")
        .gte("match_date", twoHoursAgo)
        .order("match_date", { ascending: true })
        .limit(200);

      if (league && league !== "all") {
        query = query.eq("league", league);
      }

      const { data: matches, error } = await query;
      if (error) throw error;

      return enrichMatches(matches as Match[]);
    },
  });
}

export function useLiveMatches(league?: string) {
  return useQuery({
    queryKey: ["matches", "live", league],
    refetchInterval: (query) => query.state.error ? false : 30_000,
    queryFn: async () => {
      let query = supabase
        .from("matches")
        .select("*")
        .eq("status", "live")
        .order("match_date", { ascending: true })
        .limit(50);

      if (league && league !== "all") {
        query = query.eq("league", league);
      }

      const { data: matches, error } = await query;
      if (error) throw error;

      return enrichMatches(matches as Match[]);
    },
  });
}

export function useCompletedMatches(league?: string) {
  return useQuery({
    queryKey: ["matches", "completed", league],
    refetchInterval: (query) => query.state.error ? false : 5 * 60 * 1000,
    queryFn: async () => {
      let query = supabase
        .from("matches")
        .select("*")
        .eq("status", "completed")
        .order("match_date", { ascending: false })
        .limit(12);

      if (league && league !== "all") {
        query = query.eq("league", league);
      }

      const { data: matches, error } = await query;
      if (error) throw error;

      return enrichMatches(matches as Match[]);
    },
  });
}

const LIVE_STATUSES = ["live", "1H", "2H", "HT", "ET"];

export function useMatch(id: string) {
  return useQuery({
    queryKey: ["match", id],
    queryFn: async () => {
      const { data: match, error } = await supabase
        .from("matches")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;

      const enriched = await enrichMatches([match as Match]);
      return enriched[0];
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && LIVE_STATUSES.includes(status) ? 10_000 : false;
    },
  });
}

export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*").order("name");
      if (error) throw error;
      return data as Team[];
    },
  });
}

export function useMatchFeatures(matchId: string | undefined) {
  return useQuery({
    queryKey: ["match-features", matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("match_features")
        .select("*")
        .eq("match_id", matchId!)
        .single();
      if (error) throw error;
      return data as unknown as MatchFeatures;
    },
    enabled: !!matchId,
  });
}

export function usePlayers(teamId: string | undefined) {
  return useQuery({
    queryKey: ["players", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("team_id", teamId!)
        .order("name");
      if (error) throw error;
      return data as unknown as Player[];
    },
    enabled: !!teamId,
  });
}

async function enrichMatches(matches: Match[]): Promise<Match[]> {
  if (!matches.length) return [];

  const teamIds = [...new Set(matches.flatMap((m) => [m.team_home_id, m.team_away_id]))];
  const matchIds = matches.map((m) => m.id);

  const [teamsRes, predsRes, oddsRes] = await Promise.all([
    supabase.from("teams").select("*").in("id", teamIds),
    supabase.from("predictions").select("*").in("match_id", matchIds),
    supabase.from("odds").select("*").in("match_id", matchIds),
  ]);

  const teamsMap = new Map((teamsRes.data as Team[])?.map((t) => [t.id, t]));
  const predsMap = new Map((predsRes.data as unknown as Prediction[])?.map((p) => [p.match_id, p]));
  const oddsMap = new Map((oddsRes.data as Odds[])?.map((o) => [o.match_id, o]));

  return matches.map((m) => ({
    ...m,
    home_team: teamsMap.get(m.team_home_id),
    away_team: teamsMap.get(m.team_away_id),
    prediction: predsMap.get(m.id),
    odds: oddsMap.get(m.id),
  }));
}
