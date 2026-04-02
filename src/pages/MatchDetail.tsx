import { useParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { useMatch, useMatchFeatures } from "@/hooks/useMatches";
import { useHeadToHead } from "@/hooks/useH2H";
import { ProbabilityBar } from "@/components/ProbabilityBar";
import { FunFactsCard } from "@/components/FunFactsCard";
import { MatchInsightsCard } from "@/components/MatchInsightsCard";
import { StatsBombSection } from "@/components/StatsBombSection";
import { AIInsightsCard } from "@/components/AIInsightsCard";
import { AIVerdictCard } from "@/components/AIVerdictCard";
import { MatchContextCard } from "@/components/MatchContextCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ArrowLeft, TrendingUp, Target, BarChart3, Swords, Activity } from "lucide-react";

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: match, isLoading } = useMatch(id!);
  const { data: features } = useMatchFeatures(id);

  const home_team = match?.home_team;
  const away_team = match?.away_team;
  const { data: h2h, isLoading: h2hLoading } = useHeadToHead(
    home_team?.api_football_id,
    away_team?.api_football_id
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64" />
        </main>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-6">
          <p className="text-muted-foreground">Match not found.</p>
        </main>
      </div>
    );
  }

  const { prediction, odds } = match;
  const isUpcoming = match.status === "upcoming";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 space-y-6 max-w-3xl">
        <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Match Header */}
        <Card className="border-border/50">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="uppercase tracking-wider text-xs">
                {match.league}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {new Date(match.match_date).toLocaleString("en-GB", { timeZone: "Europe/Berlin", weekday: "long", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })} CET
              </span>
            </div>

            <div className="flex items-center justify-center gap-6 py-4">
              <div className="text-center space-y-2 flex-1">
                {home_team?.logo_url ? (
                  <img src={home_team.logo_url} alt={home_team.name} className="h-12 w-12 object-contain mx-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground mx-auto">{home_team?.name?.charAt(0) ?? "?"}</div>
                )}
                <p className="text-xl font-bold">{home_team?.name}</p>
                <p className="text-xs text-muted-foreground">{home_team?.country}</p>
              </div>
              <div className="text-center shrink-0">
                {isUpcoming ? (
                  <span className="text-lg font-bold text-primary px-4 py-1 rounded-lg bg-primary/10">VS</span>
                ) : (
                  <span className="text-3xl font-bold tabular-nums">
                    {match.goals_home} - {match.goals_away}
                  </span>
                )}
              </div>
              <div className="text-center space-y-2 flex-1">
                {away_team?.logo_url ? (
                  <img src={away_team.logo_url} alt={away_team.name} className="h-12 w-12 object-contain mx-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground mx-auto">{away_team?.name?.charAt(0) ?? "?"}</div>
                )}
                <p className="text-xl font-bold">{away_team?.name}</p>
                <p className="text-xs text-muted-foreground">{away_team?.country}</p>
              </div>
            </div>

            {!isUpcoming && match.xg_home != null && (
              <div className="text-center text-sm text-muted-foreground">
                xG: {Number(match.xg_home).toFixed(1)} - {Number(match.xg_away).toFixed(1)}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Verdict */}
        {prediction && (
          <AIVerdictCard
            prediction={prediction}
            homeTeamName={home_team?.name || "Home"}
            awayTeamName={away_team?.name || "Away"}
            odds={odds}
          />
        )}

        {/* Match Features / Statistics */}
        {features && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                Match Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Form */}
              {(features.home_form_last5 || features.away_form_last5) && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">{home_team?.name} Form</p>
                    <div className="flex gap-1">
                      {(features.home_form_last5 || "").split("").map((c, i) => (
                        <span key={i} className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center ${
                          c === "W" ? "bg-green-500/20 text-green-500" :
                          c === "D" ? "bg-yellow-500/20 text-yellow-500" :
                          "bg-red-500/20 text-red-500"
                        }`}>{c}</span>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">{away_team?.name} Form</p>
                    <div className="flex gap-1">
                      {(features.away_form_last5 || "").split("").map((c, i) => (
                        <span key={i} className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center ${
                          c === "W" ? "bg-green-500/20 text-green-500" :
                          c === "D" ? "bg-yellow-500/20 text-yellow-500" :
                          "bg-red-500/20 text-red-500"
                        }`}>{c}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Averages */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-lg bg-muted p-3 space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">{home_team?.name}</p>
                  <p>Avg Scored: <span className="font-bold">{Number(features.home_avg_scored).toFixed(2)}</span></p>
                  <p>Avg Conceded: <span className="font-bold">{Number(features.home_avg_conceded).toFixed(2)}</span></p>
                  <p>Clean Sheet: <span className="font-bold">{Math.round(Number(features.home_clean_sheet_pct) * 100)}%</span></p>
                  <p>BTTS Rate: <span className="font-bold">{Math.round(Number(features.home_btts_pct) * 100)}%</span></p>
                </div>
                <div className="rounded-lg bg-muted p-3 space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">{away_team?.name}</p>
                  <p>Avg Scored: <span className="font-bold">{Number(features.away_avg_scored).toFixed(2)}</span></p>
                  <p>Avg Conceded: <span className="font-bold">{Number(features.away_avg_conceded).toFixed(2)}</span></p>
                  <p>Clean Sheet: <span className="font-bold">{Math.round(Number(features.away_clean_sheet_pct) * 100)}%</span></p>
                  <p>BTTS Rate: <span className="font-bold">{Math.round(Number(features.away_btts_pct) * 100)}%</span></p>
                </div>
              </div>

              {/* League Positions + Poisson */}
              <div className="grid grid-cols-3 gap-3 text-center">
                {features.league_position_home != null && (
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-lg font-bold text-primary">#{features.league_position_home}</p>
                    <p className="text-xs text-muted-foreground">{home_team?.name}</p>
                  </div>
                )}
                {features.poisson_xg_home > 0 && (
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-lg font-bold">{Number(features.poisson_xg_home).toFixed(1)} - {Number(features.poisson_xg_away).toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">Poisson xG</p>
                  </div>
                )}
                {features.league_position_away != null && (
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-lg font-bold text-primary">#{features.league_position_away}</p>
                    <p className="text-xs text-muted-foreground">{away_team?.name}</p>
                  </div>
                )}
              </div>

              {/* H2H from features */}
              {features.h2h_results && Array.isArray(features.h2h_results) && features.h2h_results.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Recent Head-to-Head</p>
                  {(features.h2h_results as any[]).slice(0, 5).map((h: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm rounded-lg bg-muted p-2">
                      <span className="text-xs text-muted-foreground w-20">
                        {h.date ? format(new Date(h.date), "MMM d, yyyy") : ""}
                      </span>
                      <span className="font-medium truncate flex-1 text-right">{h.home}</span>
                      <span className="font-bold tabular-nums px-3">{h.score_home} - {h.score_away}</span>
                      <span className="font-medium truncate flex-1">{h.away}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Prediction Breakdown */}
        {prediction && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4 text-primary" />
                Prediction Probabilities
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <ProbabilityBar
                homeWin={Number(prediction.home_win)}
                draw={Number(prediction.draw)}
                awayWin={Number(prediction.away_win)}
              />

              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="space-y-1 rounded-lg bg-muted p-3">
                  <p className="text-2xl font-bold text-win">{Math.round(Number(prediction.home_win) * 100)}%</p>
                  <p className="text-xs text-muted-foreground">Home Win</p>
                </div>
                <div className="space-y-1 rounded-lg bg-muted p-3">
                  <p className="text-2xl font-bold text-draw">{Math.round(Number(prediction.draw) * 100)}%</p>
                  <p className="text-xs text-muted-foreground">Draw</p>
                </div>
                <div className="space-y-1 rounded-lg bg-muted p-3">
                  <p className="text-2xl font-bold text-loss">{Math.round(Number(prediction.away_win) * 100)}%</p>
                  <p className="text-xs text-muted-foreground">Away Win</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {(Number(prediction.expected_goals_home) > 0 || Number(prediction.expected_goals_away) > 0) && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-semibold">
                        {Number(prediction.expected_goals_home).toFixed(1)} - {Number(prediction.expected_goals_away).toFixed(1)}
                      </p>
                      <p className="text-xs text-muted-foreground">Expected Goals</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">{Math.round(Number(prediction.model_confidence) * 100)}%</p>
                    <p className="text-xs text-muted-foreground">Model Confidence</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Match Intelligence */}
        <MatchContextCard
          matchId={match.id}
          homeTeamName={home_team?.name}
          awayTeamName={away_team?.name}
        />

        {/* Odds */}
        {odds && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Odds</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-lg font-bold">{Number(odds.home_win_odds).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Home</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-lg font-bold">{Number(odds.draw_odds).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Draw</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-lg font-bold">{Number(odds.away_win_odds).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Away</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Head to Head (API-Football live) */}
        {(h2h && h2h.length > 0) && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Swords className="h-4 w-4 text-primary" />
                Head to Head ({h2h.length} matches)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {h2h.slice(0, 5).map((m) => (
                <div key={m.fixture.id} className="flex items-center justify-between text-sm rounded-lg bg-muted p-2.5">
                  <span className="text-xs text-muted-foreground w-20">
                    {format(new Date(m.fixture.date), "MMM d, yyyy")}
                  </span>
                  <span className="font-medium truncate flex-1 text-right">{m.teams.home.name}</span>
                  <span className="font-bold tabular-nums px-3">
                    {m.goals.home} - {m.goals.away}
                  </span>
                  <span className="font-medium truncate flex-1">{m.teams.away.name}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {h2hLoading && <Skeleton className="h-48" />}

        {/* AI Insights */}
        <AIInsightsCard
          matchId={match.id}
          existingInsights={match.ai_insights}
          matchStatus={match.status}
          postMatchReview={match.ai_post_match_review}
          accuracyScore={match.ai_accuracy_score}
        />

        <FunFactsCard sportradarEventId={match.sportradar_id} />
        <MatchInsightsCard sportradarEventId={match.sportradar_id} />
        <StatsBombSection
          homeTeamName={home_team?.name}
          awayTeamName={away_team?.name}
          matchDate={match.match_date}
        />
      </main>
    </div>
  );
}
