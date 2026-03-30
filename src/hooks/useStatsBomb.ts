import { useQuery } from "@tanstack/react-query";
import { fetchCompetitions, fetchMatches, fetchEvents, fetchLineups } from "@/lib/statsbomb";

export function useStatsBombCompetitions() {
  return useQuery({
    queryKey: ["statsbomb", "competitions"],
    queryFn: fetchCompetitions,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

export function useStatsBombMatches(competitionId?: number, seasonId?: number) {
  return useQuery({
    queryKey: ["statsbomb", "matches", competitionId, seasonId],
    queryFn: () => fetchMatches(competitionId!, seasonId!),
    enabled: !!competitionId && !!seasonId,
    staleTime: 1000 * 60 * 60,
  });
}

export function useStatsBombEvents(matchId?: number) {
  return useQuery({
    queryKey: ["statsbomb", "events", matchId],
    queryFn: () => fetchEvents(matchId!),
    enabled: !!matchId,
    staleTime: 1000 * 60 * 60,
  });
}

export function useStatsBombLineups(matchId?: number) {
  return useQuery({
    queryKey: ["statsbomb", "lineups", matchId],
    queryFn: () => fetchLineups(matchId!),
    enabled: !!matchId,
    staleTime: 1000 * 60 * 60,
  });
}
