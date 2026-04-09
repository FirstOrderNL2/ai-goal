import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Flame } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface VolatilityCardProps {
  matchId: string;
  refereeName: string | null;
  homeTeamId: string;
  awayTeamId: string;
  league: string;
}

export function VolatilityCard({ matchId, refereeName, homeTeamId, awayTeamId, league }: VolatilityCardProps) {
  const { data: referee } = useQuery({
    queryKey: ["referee", refereeName],
    queryFn: async () => {
      if (!refereeName) return null;
      const { data } = await supabase
        .from("referees")
        .select("*")
        .eq("name", refereeName)
        .maybeSingle();
      return data;
    },
    enabled: !!refereeName,
  });

  const { data: homeDiscipline } = useQuery({
    queryKey: ["team-discipline", homeTeamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_discipline")
        .select("*")
        .eq("team_id", homeTeamId)
        .order("season", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: awayDiscipline } = useQuery({
    queryKey: ["team-discipline", awayTeamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_discipline")
        .select("*")
        .eq("team_id", awayTeamId)
        .order("season", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: features } = useQuery({
    queryKey: ["match-features-vol", matchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("match_features")
        .select("volatility_score")
        .eq("match_id", matchId)
        .maybeSingle();
      return data;
    },
  });

  // Compute volatility display
  const cupCompetitions = ["champions league", "europa league", "conference league", "world cup", "euro", "nations league"];
  const isCup = cupCompetitions.some(c => league.toLowerCase().includes(c));

  const refStrictness = referee ? Math.min(1.0, (Number(referee.yellow_avg) || 3.5) / 5.0) : 0.5;
  const combinedYellow = (Number(homeDiscipline?.yellow_avg) || 1.5) + (Number(awayDiscipline?.yellow_avg) || 1.5);
  const teamAggression = Math.min(1.0, combinedYellow / 5.0);
  const matchImportance = isCup ? 1.0 : 0.5;

  const volatilityScore = features?.volatility_score
    ? Number(features.volatility_score)
    : Math.round((refStrictness * 0.4 + teamAggression * 0.4 + matchImportance * 0.2) * 1000) / 1000;

  const volatilityLevel = volatilityScore >= 0.75 ? "High" : volatilityScore >= 0.55 ? "Medium" : "Low";
  const volatilityEmoji = volatilityScore >= 0.75 ? "🔴" : volatilityScore >= 0.55 ? "🟡" : "🟢";
  const volatilityColor = volatilityScore >= 0.75 ? "text-destructive" : volatilityScore >= 0.55 ? "text-yellow-500" : "text-green-500";

  // Expected yellow cards for this match
  const expectedYellows = Math.round(((Number(homeDiscipline?.yellow_avg) || 1.5) + (Number(awayDiscipline?.yellow_avg) || 1.5)) * 10) / 10;

  // Red card probability estimate
  const redProb = Math.min(1.0, (Number(homeDiscipline?.red_avg) || 0.05) + (Number(awayDiscipline?.red_avg) || 0.05) + (referee ? Number(referee.red_avg) * 0.3 : 0));
  const redLabel = redProb >= 0.25 ? "High" : redProb >= 0.12 ? "Medium" : "Low";

  const hasData = referee || homeDiscipline || awayDiscipline;
  if (!hasData && !refereeName) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Flame className="h-4 w-4 text-primary" />
          Match Volatility
          {volatilityScore >= 0.75 && (
            <Badge variant="destructive" className="text-[10px] ml-auto">
              <AlertTriangle className="h-3 w-3 mr-1" />
              HIGH RISK
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Volatility Score */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Volatility Score</span>
          <span className={`text-lg font-bold ${volatilityColor}`}>
            {volatilityEmoji} {volatilityLevel} ({Math.round(volatilityScore * 100)}%)
          </span>
        </div>

        {/* Referee Info */}
        {refereeName && (
          <div className="rounded-lg bg-muted p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{refereeName}</span>
              {referee && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {referee.matches_officiated} matches
                </span>
              )}
            </div>
            {referee && (
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="font-bold text-yellow-500">{Number(referee.yellow_avg).toFixed(1)}</p>
                  <p className="text-muted-foreground">Yellows/match</p>
                </div>
                <div>
                  <p className="font-bold text-destructive">{Number(referee.red_avg).toFixed(2)}</p>
                  <p className="text-muted-foreground">Reds/match</p>
                </div>
                <div>
                  <p className="font-bold text-primary">{Number(referee.penalty_avg).toFixed(2)}</p>
                  <p className="text-muted-foreground">Pens/match</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Card Predictions */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted p-3 text-center">
            <p className="text-lg font-bold text-yellow-500">{expectedYellows}</p>
            <p className="text-xs text-muted-foreground">Expected Yellows</p>
          </div>
          <div className="rounded-lg bg-muted p-3 text-center">
            <p className={`text-lg font-bold ${redProb >= 0.25 ? "text-destructive" : redProb >= 0.12 ? "text-yellow-500" : "text-green-500"}`}>
              {redLabel}
            </p>
            <p className="text-xs text-muted-foreground">Red Card Risk</p>
          </div>
        </div>

        {/* Impact Note */}
        <p className="text-xs text-muted-foreground italic">
          {volatilityScore >= 0.65
            ? "⚠️ High volatility may increase goals and unpredictability. Over/Under and BTTS adjusted accordingly."
            : "Controlled match expected. Volatility within normal range."}
        </p>
      </CardContent>
    </Card>
  );
}
