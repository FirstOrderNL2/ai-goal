import { useParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { useMatch } from "@/hooks/useMatches";
import { useHeadToHead } from "@/hooks/useH2H";
import { ProbabilityBar } from "@/components/ProbabilityBar";
import { FunFactsCard } from "@/components/FunFactsCard";
import { MatchInsightsCard } from "@/components/MatchInsightsCard";
import { StatsBombSection } from "@/components/StatsBombSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ArrowLeft, TrendingUp, Target, BarChart3, Swords } from "lucide-react";

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: match, isLoading } = useMatch(id!);

  // All hooks must be called before any early returns
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
                {format(new Date(match.match_date), "EEEE, MMM d yyyy • HH:mm")}
              </span>
            </div>

            <div className="flex items-center justify-center gap-6 py-4">
              <div className="text-center space-y-2 flex-1">
                {home_team?.logo_url && (
                  <img src={home_team.logo_url} alt={home_team.name} className="h-12 w-12 object-contain mx-auto" />
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
                {away_team?.logo_url && (
                  <img src={away_team.logo_url} alt={away_team.name} className="h-12 w-12 object-contain mx-auto" />
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

        {/* Prediction Breakdown */}
        {prediction && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4 text-primary" />
                AI Prediction
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
                <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">
                      {Number(prediction.expected_goals_home).toFixed(1)} - {Number(prediction.expected_goals_away).toFixed(1)}
                    </p>
                    <p className="text-xs text-muted-foreground">Expected Goals</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">{Math.round(Number(prediction.model_confidence) * 100)}%</p>
                    <p className="text-xs text-muted-foreground">Model Confidence</p>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <Badge variant={prediction.over_under_25 === "over" ? "default" : "outline"} className="text-sm px-4 py-1">
                  {prediction.over_under_25 === "over" ? "Over 2.5 Goals" : "Under 2.5 Goals"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

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

        {/* Head to Head */}
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

        {/* Sportradar Fun Facts */}
        <FunFactsCard sportradarEventId={match.sportradar_id} />

        {/* Sportradar AI Insights */}
        <MatchInsightsCard sportradarEventId={match.sportradar_id} />

        {/* StatsBomb Data */}
        <StatsBombSection
          homeTeamName={home_team?.name}
          awayTeamName={away_team?.name}
          matchDate={match.match_date}
        />
      </main>
    </div>
  );
}
