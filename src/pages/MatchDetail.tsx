import { useParams, Link } from "react-router-dom";
import { useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { useMatch, useMatchFeatures } from "@/hooks/useMatches";
import { ProbabilityBar } from "@/components/ProbabilityBar";
import { AIInsightsCard } from "@/components/AIInsightsCard";
import { AIVerdictCard, AIVerdictGenerating } from "@/components/AIVerdictCard";
import { MatchContextCard } from "@/components/MatchContextCard";
import { FootballIntelligenceCard } from "@/components/FootballIntelligenceCard";
import { TeamComparisonCard } from "@/components/TeamComparisonCard";
import { H2HCard } from "@/components/H2HCard";
import { OverUnderCard } from "@/components/OverUnderCard";
import { LineupsCard } from "@/components/LineupsCard";
import { PredictionComparisonCard } from "@/components/PredictionComparisonCard";
import { VolatilityCard } from "@/components/VolatilityCard";
import { PredictionHistoryCard } from "@/components/PredictionHistoryCard";
import { CommunityVoteBar } from "@/components/CommunityVoteBar";
import { CommentsSection } from "@/components/CommentsSection";
import { CommentSummaryCard } from "@/components/CommentSummaryCard";
import { AICommunityComparisonCard } from "@/components/AICommunityComparisonCard";
import { ValueBetCard } from "@/components/ValueBetCard";
import { ConfidenceEngineCard } from "@/components/ConfidenceEngineCard";
import { LiveMatchCard } from "@/components/LiveMatchCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, TrendingUp, Target, BarChart3 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLiveFixture } from "@/hooks/useFixtureData";
import { deriveMatchPhase, isMatchLive as isPhaseLive } from "@/lib/match-status";

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: match, isLoading } = useMatch(id!);
  const { data: features } = useMatchFeatures(id);
  const onDemandTriggered = useRef(false);

  // Fetch match_context for lineup fallback
  const { data: matchContext } = useQuery({
    queryKey: ["match-context", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("match_context")
        .select("*")
        .eq("match_id", id!)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!id,
  });

  // On-demand prediction generation mutation
  const generatePrediction = useMutation({
    mutationFn: async (matchId: string) => {
      const { data, error } = await supabase.functions.invoke("generate-ai-prediction", {
        body: { match_id: matchId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match", id] });
    },
  });

  const home_team = match?.home_team;
  const away_team = match?.away_team;
  const prediction = match?.prediction;

  // Auto-trigger prediction generation if prediction is missing or incomplete
  useEffect(() => {
    if (!match || !id || onDemandTriggered.current || generatePrediction.isPending) return;
    
    const isIncomplete = !prediction || !prediction.ai_reasoning || prediction.predicted_score_home == null;
    if (isIncomplete) {
      onDemandTriggered.current = true;
      generatePrediction.mutate(id);
    }
  }, [match, id, prediction]);

  const matchPhase = match ? deriveMatchPhase(match.status, match.match_date) : null;
  const isLive = matchPhase ? isPhaseLive(matchPhase) : false;
  // Pass derived status hint so useLiveFixture activates for transition_live too
  const liveStatusHint = isLive ? "live" : match?.status;
  const { data: liveFixture } = useLiveFixture(match?.api_football_id, liveStatusHint);

  // Compute estimated elapsed minutes from kickoff time
  const getEstimatedElapsed = () => {
    if (!match?.match_date || !isLive) return null;
    const kickoff = new Date(match.match_date).getTime();
    const now = Date.now();
    const diffMin = Math.floor((now - kickoff) / 60000);
    if (match.status === "1H" || match.status === "live") return Math.min(Math.max(diffMin, 1), 45);
    if (match.status === "2H") return Math.min(Math.max(diffMin - 15, 46), 90); // ~15 min break
    return null;
  };

  const statusLabel: Record<string, string> = { "1H": "1st Half", "2H": "2nd Half", "HT": "Half Time", "ET": "Extra Time", "live": "Live" };

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

  const { odds } = match;
  const isUpcoming = matchPhase === "upcoming";
  const isMatchLive = isLive;
  const h2hResults = features?.h2h_results as any[] | null;

  const liveGoalsHome = liveFixture?.goals?.home;
  const liveGoalsAway = liveFixture?.goals?.away;
  const liveElapsed = liveFixture?.fixture?.status?.elapsed;
  const liveStatusShort = liveFixture?.fixture?.status?.short;

  const isPredictionIncomplete = !prediction || !prediction.ai_reasoning || prediction.predicted_score_home == null;
  const isGenerating = generatePrediction.isPending;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 space-y-6 max-w-3xl">
        <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* 1. Match Header */}
        <Card className="border-border/50">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="uppercase tracking-wider text-xs">
                  {match.league}
                </Badge>
                {isMatchLive && (
                  <Badge className="bg-green-500/20 text-green-500 text-[10px] animate-pulse font-bold">
                    LIVE {liveElapsed != null ? `${liveElapsed}'` : liveStatusShort || (getEstimatedElapsed() ? `~${getEstimatedElapsed()}'` : statusLabel[match.status] || "")}
                  </Badge>
                )}
              </div>
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
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-3xl font-bold tabular-nums">
                      {isMatchLive && liveGoalsHome != null ? liveGoalsHome : match.goals_home} - {isMatchLive && liveGoalsAway != null ? liveGoalsAway : match.goals_away}
                    </span>
                    {isMatchLive && (
                      <span className="text-xs text-green-500 font-mono animate-pulse">
                        {liveElapsed != null ? `${liveElapsed}'` : getEstimatedElapsed() ? `~${getEstimatedElapsed()}'` : statusLabel[match.status] || ""}
                      </span>
                    )}
                  </div>
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

        {/* 2. Live Score + Events (live matches only) */}
        <LiveMatchCard
          apiFootballId={match.api_football_id}
          matchStatus={liveStatusHint}
          homeTeamName={home_team?.name}
          awayTeamName={away_team?.name}
        />

        {/* 3. AI Verdict */}
        {isGenerating && isPredictionIncomplete ? (
          <AIVerdictGenerating />
        ) : prediction && !isPredictionIncomplete ? (
          <AIVerdictCard
            prediction={prediction}
            homeTeamName={home_team?.name || "Home"}
            awayTeamName={away_team?.name || "Away"}
            odds={odds}
          />
        ) : null}

        {/* 3b. Confidence Engine 2.0 */}
        {prediction && !isPredictionIncomplete && (
          <ConfidenceEngineCard
            prediction={prediction}
            features={features}
            matchContext={matchContext as any}
            matchId={match.id}
          />
        )}

        {/* 3c. Pre-Match vs HT Comparison */}
        {prediction && !isPredictionIncomplete && (
          <PredictionComparisonCard
            prediction={prediction}
            homeTeamName={home_team?.name || "Home"}
            awayTeamName={away_team?.name || "Away"}
          />
        )}

        {/* 3c. Prediction History */}
        {prediction && !isPredictionIncomplete && <PredictionHistoryCard prediction={prediction} />}

        {/* 3d. Community Feedback */}
        {prediction && !isPredictionIncomplete && (
          <CommunityVoteBar predictionId={prediction.id} />
        )}

        {/* 3e. AI vs Community Comparison */}
        {prediction && !isPredictionIncomplete && (
          <AICommunityComparisonCard
            predictionId={prediction.id}
            prediction={prediction}
            homeTeamName={home_team?.name || "Home"}
            awayTeamName={away_team?.name || "Away"}
          />
        )}

        {/* 3f. Value Bet Detection */}
        {prediction && !isPredictionIncomplete && odds && (
          <ValueBetCard
            prediction={prediction}
            odds={odds}
            homeTeamName={home_team?.name || "Home"}
            awayTeamName={away_team?.name || "Away"}
          />
        )}

        {/* 3g. Community Pulse + Discussion */}
        {prediction && !isPredictionIncomplete && (
          <>
            <CommentSummaryCard predictionId={prediction.id} />
            <CommentsSection predictionId={prediction.id} />
          </>
        )}

        {/* 4. Team Comparison */}
        {features && (
          <TeamComparisonCard features={features} homeTeam={home_team} awayTeam={away_team} />
        )}

        {/* 5. Lineups */}
        <LineupsCard
          apiFootballId={match.api_football_id}
          homeTeamName={home_team?.name}
          awayTeamName={away_team?.name}
          dbLineupHome={matchContext?.lineup_home}
          dbLineupAway={matchContext?.lineup_away}
        />

        {/* 6. Prediction Probabilities */}
        {prediction && !isPredictionIncomplete && (
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

        {/* 7. Over/Under & BTTS */}
        {prediction && !isPredictionIncomplete && (
          <OverUnderCard prediction={prediction} features={features} />
        )}

        {/* 8. Head-to-Head */}
        {h2hResults && h2hResults.length > 0 && (
          <H2HCard
            results={h2hResults}
            homeTeamName={home_team?.name || "Home"}
            awayTeamName={away_team?.name || "Away"}
          />
        )}

        {/* 9. Volatility & Referee */}
        <VolatilityCard
          matchId={match.id}
          refereeName={match.referee ?? null}
          homeTeamId={match.team_home_id}
          awayTeamId={match.team_away_id}
          league={match.league}
        />

        {/* 10. Football Intelligence */}
        <FootballIntelligenceCard
          matchId={match.id}
          homeTeamName={home_team?.name}
          awayTeamName={away_team?.name}
        />

        {/* 10b. Match Intelligence (Enrichment Signals) */}
        <MatchContextCard
          matchId={match.id}
          homeTeamName={home_team?.name}
          awayTeamName={away_team?.name}
        />

        {/* 10. AI Commentary */}
        <AIInsightsCard
          matchId={match.id}
          existingInsights={match.ai_insights}
          matchStatus={match.status}
          postMatchReview={match.ai_post_match_review}
          accuracyScore={match.ai_accuracy_score}
        />

        {/* 11. Odds + Market Edge */}
        {odds && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Odds & Market Edge</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { label: "Home", value: Number(odds.home_win_odds), aiProb: prediction ? Number(prediction.home_win) : null },
                  { label: "Draw", value: Number(odds.draw_odds), aiProb: prediction ? Number(prediction.draw) : null },
                  { label: "Away", value: Number(odds.away_win_odds), aiProb: prediction ? Number(prediction.away_win) : null },
                ].map(({ label, value, aiProb }) => {
                  const implied = 1 / value;
                  const delta = aiProb != null ? aiProb - implied : null;
                  const isValue = delta != null && delta > 0.05;
                  return (
                    <div key={label} className={`rounded-lg p-3 ${isValue ? "bg-green-500/10 border border-green-500/30" : "bg-muted"}`}>
                      <p className="text-lg font-bold">{value.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      {delta != null && Math.abs(delta) > 0.03 && (
                        <p className={`text-[10px] font-semibold mt-1 ${delta > 0 ? "text-green-500" : "text-destructive"}`}>
                          {delta > 0 ? "+" : ""}{Math.round(delta * 100)}% vs AI
                          {isValue && " 💎"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
