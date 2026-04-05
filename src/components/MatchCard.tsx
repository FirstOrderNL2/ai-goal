import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProbabilityBar } from "./ProbabilityBar";
import { deriveMatchPhase, isMatchLive as isPhaseLive } from "@/lib/match-status";
import type { Match } from "@/lib/types";
import { TrendingUp, ArrowRight, RefreshCw } from "lucide-react";

function useLiveMinute(matchDate: string, status: string, isLive: boolean): string {
  const [minute, setMinute] = useState(() => computeMinute(matchDate, status));

  useEffect(() => {
    if (!isLive) return;
    setMinute(computeMinute(matchDate, status));
    const id = setInterval(() => setMinute(computeMinute(matchDate, status)), 30000);
    return () => clearInterval(id);
  }, [matchDate, status, isLive]);

  return minute;
}

function computeMinute(matchDate: string, status: string): string {
  if (status === "HT") return "HT";
  if (status === "ET") return "ET";
  const kickoff = new Date(matchDate).getTime();
  const elapsed = Math.floor((Date.now() - kickoff) / 60000);
  if (status === "1H") return `${Math.max(0, Math.min(elapsed, 45))}'`;
  if (status === "2H") return `${Math.max(45, Math.min(elapsed - 15, 90))}'`;
  // generic "live"
  if (elapsed <= 45) return `${Math.max(0, elapsed)}'`;
  if (elapsed <= 60) return "HT";
  return `${Math.max(45, Math.min(elapsed - 15, 90))}'`;
}

function formatRound(round: string | null | undefined): string | null {
  if (!round) return null;
  // "Regular Season - 28" → "MD 28"
  const regMatch = round.match(/Regular Season\s*-\s*(\d+)/i);
  if (regMatch) return `MD ${regMatch[1]}`;
  // "Quarter-finals" → "QF", "Semi-finals" → "SF", "Final" → "Final"
  if (/quarter/i.test(round)) {
    const leg = round.match(/leg\s*(\d)/i);
    return leg ? `QF Leg ${leg[1]}` : "QF";
  }
  if (/semi/i.test(round)) {
    const leg = round.match(/leg\s*(\d)/i);
    return leg ? `SF Leg ${leg[1]}` : "SF";
  }
  if (/final/i.test(round) && !/quarter|semi/i.test(round)) return "Final";
  // "Round of 16" style
  if (/round of/i.test(round)) {
    const leg = round.match(/leg\s*(\d)/i);
    const base = round.match(/round of (\d+)/i);
    return base ? `R${base[1]}${leg ? ` Leg ${leg[1]}` : ""}` : round;
  }
  // Fallback: truncate if too long
  return round.length > 20 ? round.substring(0, 18) + "…" : round;
}

function formatFreshness(prediction: Match["prediction"]): { label: string; isHT: boolean } | null {
  if (!prediction) return null;
  const intervals = prediction.prediction_intervals;
  const hasHT = intervals?.some((i) => i.label === "HT");
  if (hasHT) return { label: "HT prediction", isHT: true };

  const lastAt = prediction.last_prediction_at;
  if (!lastAt) return null;
  const diffMin = Math.floor((Date.now() - new Date(lastAt).getTime()) / 60000);
  if (diffMin < 1) return { label: "Updated just now", isHT: false };
  if (diffMin < 60) return { label: `Updated ${diffMin}m ago`, isHT: false };
  if (diffMin < 1440) return { label: `Updated ${Math.floor(diffMin / 60)}h ago`, isHT: false };
  return { label: `Updated ${Math.floor(diffMin / 1440)}d ago`, isHT: false };
}

function PredictionFreshness({ prediction }: { prediction: Match["prediction"] }) {
  const info = formatFreshness(prediction);
  if (!info) return null;
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <RefreshCw className="h-2.5 w-2.5" />
      <span className={info.isHT ? "font-semibold text-primary" : ""}>{info.label}</span>
    </div>
  );
}

interface MatchCardProps {
  match: Match;
}

export function MatchCard({ match }: MatchCardProps) {
  const navigate = useNavigate();
  const { home_team, away_team, prediction, odds } = match;
  const isUpcoming = match.status === "upcoming";
  const isLive = match.status === "live" || match.status === "1H" || match.status === "2H" || match.status === "HT" || match.status === "ET";
  const roundLabel = formatRound(match.round);
  const liveMinute = useLiveMinute(match.match_date, match.status, isLive);
  return (
    <div onClick={() => navigate(`/match/${match.id}`)} className="cursor-pointer">
      <Card className={`group border-border/50 bg-card transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 ${isLive ? "ring-1 ring-green-500/30 shadow-green-500/10 shadow-md" : ""}`}>
        <CardContent className="p-4 space-y-3">
          {/* League & Date */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                {match.league}
              </Badge>
              {roundLabel && (
                <Badge variant="outline" className="text-[10px] font-medium text-foreground border-primary/30">
                  {roundLabel}
                </Badge>
              )}
              {isLive && (
                <Badge className="text-[10px] bg-green-500/20 text-green-500 border-green-500/30 font-bold gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
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
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              {isUpcoming ? (
                <span className="text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">VS</span>
              ) : match.goals_home != null && match.goals_away != null ? (
                <span className={`text-lg font-bold tabular-nums ${isLive ? "text-emerald-400" : ""}`}>
                  {match.goals_home} - {match.goals_away}
                </span>
              ) : (
                <span className="text-xs font-bold text-muted-foreground px-2 py-0.5 rounded bg-muted">FT</span>
              )}
              {isLive && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 tabular-nums">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {liveMinute}
                </span>
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
                  {prediction.best_pick
                    ? prediction.best_pick
                    : prediction.over_under_25 === "over" ? "O2.5" : "U2.5"}
                </Badge>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span>{Math.round(Number(prediction.model_confidence) * 100)}%</span>
                  <span className="text-[10px]">conf</span>
                </div>
              </div>

              {/* Prediction freshness */}
              <PredictionFreshness prediction={prediction} />
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
