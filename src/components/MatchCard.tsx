import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProbabilityBar } from "./ProbabilityBar";
import type { Match } from "@/lib/types";
import { TrendingUp, ArrowRight } from "lucide-react";

interface MatchCardProps {
  match: Match;
}

export function MatchCard({ match }: MatchCardProps) {
  const navigate = useNavigate();
  const { home_team, away_team, prediction, odds } = match;
  const isUpcoming = match.status === "upcoming";
  const isLive = match.status === "live" || match.status === "1H" || match.status === "2H" || match.status === "HT";

  return (
    <div onClick={() => navigate(`/match/${match.id}`)} className="cursor-pointer">
      <Card className="group border-border/50 bg-card transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
        <CardContent className="p-4 space-y-3">
          {/* League & Date */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                {match.league}
              </Badge>
              {match.round && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  {match.round}
                </Badge>
              )}
              {isLive && (
                <Badge className="text-[10px] bg-destructive text-destructive-foreground animate-pulse">
                  LIVE
                </Badge>
              )}
              {match.status === "FT" && (
                <Badge variant="outline" className="text-[10px]">FT</Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {new Date(match.match_date).toLocaleString("en-GB", { timeZone: "Europe/Berlin", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} CET
            </span>
          </div>

          {/* Teams */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 flex items-center justify-end gap-2">
              {home_team?.logo_url ? (
                <img src={home_team.logo_url} alt={home_team.name} className="h-6 w-6 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">{home_team?.name?.charAt(0) ?? "?"}</div>
              )}
              <p className="text-sm font-semibold truncate">{home_team?.name ?? "TBD"}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isUpcoming ? (
                <span className="text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">VS</span>
              ) : match.goals_home != null && match.goals_away != null ? (
                <span className="text-lg font-bold tabular-nums">
                  {match.goals_home} - {match.goals_away}
                </span>
              ) : (
                <span className="text-xs font-bold text-muted-foreground px-2 py-0.5 rounded bg-muted">FT</span>
              )}
            </div>
            <div className="flex-1 flex items-center gap-2">
              {away_team?.logo_url ? (
                <img src={away_team.logo_url} alt={away_team.name} className="h-6 w-6 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">{away_team?.name?.charAt(0) ?? "?"}</div>
              )}
              <p className="text-sm font-semibold truncate">{away_team?.name ?? "TBD"}</p>
            </div>
          </div>

          {/* Prediction */}
          {prediction && (
            <>
              <ProbabilityBar
                homeWin={Number(prediction.home_win)}
                draw={Number(prediction.draw)}
                awayWin={Number(prediction.away_win)}
              />

              <div className="flex items-center justify-between text-xs">
                {(Number(prediction.expected_goals_home) > 0 || Number(prediction.expected_goals_away) > 0) && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    <span>xG: {Number(prediction.expected_goals_home).toFixed(1)} - {Number(prediction.expected_goals_away).toFixed(1)}</span>
                  </div>
                )}
                <Badge
                  variant={prediction.over_under_25 === "over" ? "default" : "outline"}
                  className="text-[10px]"
                >
                  {prediction.over_under_25 === "over" ? "O2.5" : "U2.5"}
                </Badge>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span>{Math.round(Number(prediction.model_confidence) * 100)}%</span>
                  <span className="text-[10px]">conf</span>
                </div>
              </div>
            </>
          )}

          {/* Odds */}
          {odds && (
            <div className="flex justify-between text-[10px] text-muted-foreground border-t border-border/50 pt-2">
              <span>H {Number(odds.home_win_odds).toFixed(2)}</span>
              <span>D {Number(odds.draw_odds).toFixed(2)}</span>
              <span>A {Number(odds.away_win_odds).toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-end">
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
