import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { deriveMatchPhase, isMatchLive, type MatchPhase } from "@/lib/match-status";
import type { Match, Team, Prediction, Odds, MatchFeatures, Player } from "@/lib/types";

/**
 * Single dashboard query: fetches upcoming + live + recently-started matches,
 * then partitions them by derived phase so there's no dead zone.
 */
export function useDashboardMatches(league?: string) {
  return useQuery({
    queryKey: ["matches", "dashboard", league],
    refetchInterval: 30_000,
    queryFn: async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      // Fetch all non-completed matches that could be live or upcoming
      let query = supabase
        .from("matches")
        .select("*")
        .in("status", ["upcoming", "live", "1H", "2H", "HT", "ET"])
        .gte("match_date", twoHoursAgo)
        .order("match_date", { ascending: true })
        .limit(200);

      if (league && league !== "all") {
        query = query.eq("league", league);
      }

      const { data: matches, error } = await query;
      if (error) throw error;

      const enriched = await enrichMatches(matches as Match[]);

      // Partition by derived phase
      const live: Match[] = [];
      const upcoming: Match[] = [];
      const transitionIds: string[] = [];

      for (const m of enriched) {
        const phase = deriveMatchPhase(m.status, m.match_date);
        if (isMatchLive(phase)) {
          live.push(m);
          if (phase === "transition_live") transitionIds.push(m.id);
        } else if (phase === "upcoming") {
          upcoming.push(m);
        }
      }

      return { live, upcoming, transitionIds };
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
      const m = query.state.data;
      if (!m) return false;
      const phase = deriveMatchPhase(m.status, m.match_date);
      // Poll aggressively for live and transition_live
      if (isMatchLive(phase)) return 10_000;
      return false;
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

  const [teamsRes, predsRes, oddsRes, votesRes, featuresRes] = await Promise.all([
    supabase.from("teams").select("*").in("id", teamIds),
    // Production read: never expose training_only or low-quality predictions to UI.
    // See src/lib/predictionFilters.ts.
    supabase
      .from("predictions")
      .select("*")
      .in("match_id", matchIds)
      .eq("training_only", false)
      .eq("publish_status", "published"),
    supabase.from("odds").select("*").in("match_id", matchIds),
    supabase.from("prediction_votes").select("prediction_id, vote_type").in(
      "prediction_id",
      // We'll filter after we have predictions
      matchIds // placeholder — we filter below
    ),
    supabase.from("match_features").select("match_id, volatility_score").in("match_id", matchIds),
  ]);

  const teamsMap = new Map((teamsRes.data as Team[])?.map((t) => [t.id, t]));
  const predsMap = new Map((predsRes.data as unknown as Prediction[])?.map((p) => [p.match_id, p]));
  const oddsMap = new Map((oddsRes.data as Odds[])?.map((o) => [o.match_id, o]));

  // Build vote counts per prediction
  const votesByPred = new Map<string, { agree: number; disagree: number }>();
  for (const v of (votesRes.data ?? []) as { prediction_id: string; vote_type: string }[]) {
    const existing = votesByPred.get(v.prediction_id) ?? { agree: 0, disagree: 0 };
    if (v.vote_type === "agree") existing.agree++;
    else existing.disagree++;
    votesByPred.set(v.prediction_id, existing);
  }

  // Volatility by match
  const volMap = new Map<string, number>();
  for (const f of (featuresRes.data ?? []) as { match_id: string; volatility_score: number | null }[]) {
    if (f.volatility_score != null) volMap.set(f.match_id, Number(f.volatility_score));
  }

  return matches.map((m) => {
    const rawPred = predsMap.get(m.id);
    // P6 publish gate + ML training_only flag: hide both from UI consumers.
    const pred =
      rawPred && ((rawPred as any).publish_status === "low_quality" || (rawPred as any).training_only === true)
        ? undefined
        : rawPred;
    const votes = pred ? votesByPred.get(pred.id) : undefined;
    const totalVotes = votes ? votes.agree + votes.disagree : 0;
    const disagreement = votes && totalVotes > 0 ? Math.min(votes.agree, votes.disagree) / totalVotes : 0;
    const vol = volMap.get(m.id) ?? 0;

    // Hot score: engagement + disagreement + volatility
    const hotScore = (totalVotes * 0.4) + (disagreement * 30) + (vol * 30);

    return {
      ...m,
      home_team: teamsMap.get(m.team_home_id),
      away_team: teamsMap.get(m.team_away_id),
      prediction: pred,
      odds: oddsMap.get(m.id),
      hotScore,
    };
  });
}
