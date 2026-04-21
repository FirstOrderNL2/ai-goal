import { Header } from "@/components/Header";
import { useCompletedMatches } from "@/hooks/useMatches";
import { useLatestPerformance, useModelPerformance } from "@/hooks/useModelPerformance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, ScatterChart, Scatter, Cell } from "recharts";
import { CheckCircle, XCircle, Target, TrendingUp, AlertTriangle, BarChart3, Activity, Brain, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MLReadinessPanel } from "@/components/MLReadinessPanel";

function usePredictionReviews() {
  return useQuery({
    queryKey: ["prediction-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prediction_reviews")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
}

function useTotalReviewCount() {
  return useQuery({
    queryKey: ["prediction-reviews", "total-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("prediction_reviews")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function usePredictionPublishStats() {
  return useQuery({
    queryKey: ["predictions", "publish-status-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("publish_status, quality_score");
      if (error) throw error;
      return (data ?? []).reduce(
        (acc, row) => {
          const status = row.publish_status === "low_quality" ? "low_quality" : "published";
          acc[status] += 1;
          if (typeof row.quality_score === "number") {
            acc[`${status}_quality_sum` as "published_quality_sum" | "low_quality_quality_sum"] += row.quality_score;
          }
          return acc;
        },
        { published: 0, low_quality: 0, published_quality_sum: 0, low_quality_quality_sum: 0 },
      );
    },
  });
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Accuracy() {
  const { data: completed, isLoading } = useCompletedMatches();
  const { data: perf, isLoading: perfLoading } = useLatestPerformance();
  const { data: perfHistory } = useModelPerformance();
  const { data: reviews } = usePredictionReviews();
  const { data: totalReviews } = useTotalReviewCount();
  const { data: publishStats } = usePredictionPublishStats();
  const [computing, setComputing] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  // Local computation from completed matches (fallback when no model_performance row)
  const stats = completed
    ? completed.reduce(
        (acc, m) => {
          if (!m.prediction || m.goals_home == null || m.goals_away == null) return acc;
          acc.total++;
          const pred = m.prediction;
          const actualHome = m.goals_home > m.goals_away;
          const actualDraw = m.goals_home === m.goals_away;
          const actualAway = m.goals_away > m.goals_home;
          const predHome = Number(pred.home_win) > Number(pred.draw) && Number(pred.home_win) > Number(pred.away_win);
          const predDraw = Number(pred.draw) > Number(pred.home_win) && Number(pred.draw) > Number(pred.away_win);
          const predAway = Number(pred.away_win) > Number(pred.home_win) && Number(pred.away_win) > Number(pred.draw);
          if ((actualHome && predHome) || (actualDraw && predDraw) || (actualAway && predAway)) acc.correct++;
          const totalGoals = m.goals_home + m.goals_away;
          const predOver = pred.over_under_25 === "over";
          if ((totalGoals > 2.5 && predOver) || (totalGoals <= 2.5 && !predOver)) acc.ouCorrect++;
          acc.ouTotal++;
          const actualBtts = m.goals_home > 0 && m.goals_away > 0;
          if ((pred.btts === "yes") === actualBtts) acc.bttsCorrect++;
          acc.bttsTotal++;
          if (pred.predicted_score_home === m.goals_home && pred.predicted_score_away === m.goals_away) acc.exactHits++;
          return acc;
        },
        { total: 0, correct: 0, ouTotal: 0, ouCorrect: 0, bttsTotal: 0, bttsCorrect: 0, exactHits: 0 },
      )
    : null;

  const outcomeAcc = perf?.outcome_accuracy ?? (stats && stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0);
  const ouAcc = perf?.ou_25_accuracy ?? (stats && stats.ouTotal > 0 ? Math.round((stats.ouCorrect / stats.ouTotal) * 100) : 0);
  const bttsAcc = perf?.btts_accuracy ?? (stats && stats.bttsTotal > 0 ? Math.round((stats.bttsCorrect / stats.bttsTotal) * 100) : 0);
  const exactHits = perf?.exact_score_hits ?? stats?.exactHits ?? 0;
  const totalMatches = perf?.total_matches ?? stats?.total ?? 0;
  const brierAvg = perf ? Math.round(((perf.avg_brier_1x2 + perf.avg_brier_ou + perf.avg_brier_btts) / 3) * 1000) / 1000 : null;
  const mae = perf?.mae_goals ?? null;
  const validationMetrics = (perf?.validation_metrics ?? {}) as Record<string, number | string | null>;
  const brierImprovement = typeof validationMetrics.improvement === "number" ? validationMetrics.improvement : null;
  const holdoutSample = typeof validationMetrics.holdout_sample_size === "number" ? validationMetrics.holdout_sample_size : null;
  const excludedLowQuality = typeof validationMetrics.excluded_low_quality_predictions === "number" ? validationMetrics.excluded_low_quality_predictions : (publishStats?.low_quality ?? 0);

  // Calibration chart data
  const calibrationData = perf?.calibration_data
    ? Object.entries(perf.calibration_data)
        .map(([key, val]) => ({
          bucket: key,
          predicted: Math.round(val.avg_predicted * 100),
          actual: Math.round(val.actual_rate * 100),
          count: val.count,
        }))
        .sort((a, b) => a.predicted - b.predicted)
    : [];

  // Goal line accuracy chart data
  const goalLineData = perf?.goal_line_accuracy
    ? Object.entries(perf.goal_line_accuracy)
        .filter(([k]) => k.startsWith("over_"))
        .map(([key, val]) => ({
          name: key.replace("over_", "O ").replace("_", "."),
          accuracy: val,
        }))
    : [];

  // Learning trend from performance history
  const trendData = (perfHistory || [])
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((p, i) => ({
      period: `#${i + 1}`,
      outcome: p.outcome_accuracy,
      ou: p.ou_25_accuracy,
      btts: p.btts_accuracy,
      date: new Date(p.created_at).toLocaleDateString(),
    }));

  // Determine if learning is happening
  const isLearning = trendData.length >= 3 && (() => {
    const recent = trendData.slice(-3);
    const earlier = trendData.slice(0, Math.max(1, trendData.length - 3));
    const recentAvg = recent.reduce((s, d) => s + d.outcome, 0) / recent.length;
    const earlierAvg = earlier.reduce((s, d) => s + d.outcome, 0) / earlier.length;
    return recentAvg > earlierAvg;
  })();

  // Error pattern analysis from prediction_reviews
  const errorPatterns = (() => {
    if (!reviews || reviews.length === 0) return [];
    const counts: Record<string, number> = {};
    for (const r of reviews) {
      if (r.error_type) counts[r.error_type] = (counts[r.error_type] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count, pct: Math.round((count / reviews.length) * 100) }));
  })();

  // League breakdown from reviews
  const leagueBreakdown = (() => {
    if (!reviews || reviews.length === 0) return [];
    const leagues: Record<string, { correct: number; total: number }> = {};
    for (const r of reviews) {
      const l = r.league || "Unknown";
      if (!leagues[l]) leagues[l] = { correct: 0, total: 0 };
      leagues[l].total++;
      if (r.outcome_correct) leagues[l].correct++;
    }
    return Object.entries(leagues)
      .filter(([, d]) => d.total >= 3)
      .map(([league, d]) => ({
        league,
        accuracy: Math.round((d.correct / d.total) * 100),
        total: d.total,
      }))
      .sort((a, b) => b.total - a.total);
  })();

  // Confidence calibration scatter
  const confCalData = (() => {
    if (!reviews || reviews.length === 0) return [];
    const buckets: Record<number, { correct: number; total: number }> = {};
    for (const r of reviews) {
      const conf = Math.round((r.confidence_at_prediction || 0) * 10) * 10;
      if (!buckets[conf]) buckets[conf] = { correct: 0, total: 0 };
      buckets[conf].total++;
      if (r.outcome_correct) buckets[conf].correct++;
    }
    return Object.entries(buckets)
      .filter(([, d]) => d.total >= 2)
      .map(([conf, d]) => ({
        predicted: Number(conf),
        actual: Math.round((d.correct / d.total) * 100),
        count: d.total,
      }))
      .sort((a, b) => a.predicted - b.predicted);
  })();

  const chartConfig = {
    accuracy: { label: "Accuracy %", color: "hsl(var(--primary))" },
    predicted: { label: "Predicted", color: "hsl(var(--primary))" },
    actual: { label: "Actual", color: "hsl(var(--chart-2))" },
    outcome: { label: "1X2", color: "hsl(var(--primary))" },
    ou: { label: "O/U", color: "hsl(var(--chart-2))" },
    btts: { label: "BTTS", color: "hsl(var(--chart-3))" },
    count: { label: "Count", color: "hsl(var(--chart-4))" },
  };

  const summaryChartData = [
    { name: "1X2", accuracy: outcomeAcc, fill: "hsl(var(--primary))" },
    { name: "O/U 2.5", accuracy: ouAcc, fill: "hsl(var(--chart-2))" },
    { name: "BTTS", accuracy: bttsAcc, fill: "hsl(var(--chart-3))" },
  ];

  async function runCompute() {
    setComputing(true);
    try {
      await supabase.functions.invoke("compute-model-performance", { method: "POST", body: {} });
      window.location.reload();
    } catch (e) { console.error(e); }
    setComputing(false);
  }

  async function runBatchReview() {
    setReviewing(true);
    try {
      await supabase.functions.invoke("batch-review-matches", { method: "POST", body: {} });
      window.location.reload();
    } catch (e) { console.error(e); }
    setReviewing(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              AI <span className="text-primary">Performance</span>
            </h1>
            <p className="text-sm text-muted-foreground" title="Metrics are computed from completed matches in the last 90 days. The full review history powers the next learning cycle.">
              <span className="cursor-help underline decoration-dotted decoration-muted-foreground/40">{totalMatches} matches in 90-day window</span>
              {totalReviews != null ? <> • <span className="font-mono text-foreground/80">{totalReviews.toLocaleString()}</span> total reviews on record</> : null}
              {perf ? <> • Last computed {new Date(perf.created_at).toLocaleDateString()} <span className="text-muted-foreground/70">({formatRelativeTime(perf.created_at)})</span></> : <> • Live computation from match data</>}
              {perf?.model_version ? <> • <span className="text-primary font-semibold">Model v{perf.model_version}</span> active</> : null}
            </p>
            {perf && (Date.now() - new Date(perf.created_at).getTime()) > 24 * 60 * 60 * 1000 && (() => {
              const lastCount = perf.last_learning_match_count ?? 0;
              const nextAt = lastCount + 50;
              const current = totalReviews ?? totalMatches;
              return (
                <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full bg-draw/15 text-draw border border-draw/30 text-[10px]">
                  <AlertTriangle className="h-3 w-3" />
                  Stats refresh on next learning cycle (next at {nextAt} reviews, currently {current.toLocaleString()})
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            {trendData.length >= 3 && (
              <Badge variant={isLearning ? "default" : "destructive"} className="text-xs">
                {isLearning ? (
                  <><Brain className="h-3 w-3 mr-1" /> Learning ✅</>
                ) : (
                  <><Zap className="h-3 w-3 mr-1" /> Static ⚠️</>
                )}
              </Badge>
            )}
            <button onClick={runBatchReview} disabled={reviewing}
              className="text-xs px-3 py-1.5 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-50">
              {reviewing ? "Reviewing…" : "Batch Review"}
            </button>
            <button onClick={runCompute} disabled={computing}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {computing ? "Computing…" : "Refresh Metrics"}
            </button>
          </div>
        </div>

        {isLoading || perfLoading ? (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              <Card className="border-border/50">
                <CardContent className="p-3 text-center">
                  <Target className="h-5 w-5 text-primary mx-auto mb-1" />
                  <p className="text-xl font-bold">{outcomeAcc}%</p>
                  <p className="text-[10px] text-muted-foreground">1X2 Accuracy</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-3 text-center">
                  <BarChart3 className="h-5 w-5 text-chart-2 mx-auto mb-1" />
                  <p className="text-xl font-bold">{ouAcc}%</p>
                  <p className="text-[10px] text-muted-foreground">O/U 2.5</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-3 text-center">
                  <CheckCircle className="h-5 w-5 text-win mx-auto mb-1" />
                  <p className="text-xl font-bold">{bttsAcc}%</p>
                  <p className="text-[10px] text-muted-foreground">BTTS</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-3 text-center">
                  <TrendingUp className="h-5 w-5 text-primary mx-auto mb-1" />
                  <p className="text-xl font-bold">{exactHits}</p>
                  <p className="text-[10px] text-muted-foreground">Exact Scores</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-3 text-center">
                  <Activity className="h-5 w-5 text-draw mx-auto mb-1" />
                  <p className="text-xl font-bold">{brierAvg ?? "—"}</p>
                  <p className="text-[10px] text-muted-foreground">Avg Brier</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-3 text-center">
                  <XCircle className="h-5 w-5 text-destructive mx-auto mb-1" />
                  <p className="text-xl font-bold">{mae ?? "—"}</p>
                  <p className="text-[10px] text-muted-foreground">MAE Goals</p>
                </CardContent>
              </Card>
            </div>

            {/* Model Version Header */}
            {perf?.model_version != null && (() => {
              const lastCount = perf.last_learning_match_count ?? 0;
              const nextCycle = lastCount + 50;
              // Cycle progress is driven by total reviews on record, NOT the 90-day window.
              // Fall back to totalMatches only if review count hasn't loaded yet.
              const cycleBase = totalReviews ?? totalMatches;
              const delta = cycleBase - lastCount;
              const progress = nextCycle > 0
                ? Math.min(100, Math.max(0, (delta / 50) * 100))
                : 0;
              const matchesUntilNext = Math.max(0, nextCycle - cycleBase);
              const status = perf.validation_result || "pending";
              const statusColor =
                status === "passed" ? "bg-win/15 text-win border-win/30" :
                status === "bootstrap" ? "bg-primary/15 text-primary border-primary/30" :
                status === "failed" ? "bg-destructive/15 text-destructive border-destructive/30" :
                "bg-muted text-muted-foreground border-border";
              return (
                <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15 border border-primary/30">
                          <Brain className="h-7 w-7 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-bold tracking-tight">Model v{perf.model_version}</h2>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide ${statusColor}`}>
                              {status}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Last cycle at {lastCount} matches • Next cycle in {matchesUntilNext} matches
                          </p>
                        </div>
                      </div>
                      <div className="flex-1 min-w-[200px] max-w-md space-y-3">
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                            <span>Cycle progress (reviews)</span>
                            <span className="font-mono">{cycleBase.toLocaleString()}/{nextCycle.toLocaleString()}</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
                            <p className="text-[9px] text-muted-foreground">Holdout</p>
                            <p className="text-xs font-mono font-semibold">{holdoutSample ?? "—"}</p>
                          </div>
                          <div className="rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
                            <p className="text-[9px] text-muted-foreground">Brier Δ</p>
                            <p className={`text-xs font-mono font-semibold ${brierImprovement != null && brierImprovement >= 0 ? "text-win" : "text-destructive"}`}>
                              {brierImprovement != null ? `${brierImprovement > 0 ? "+" : ""}${brierImprovement.toFixed(4)}` : "—"}
                            </p>
                          </div>
                          <div className="rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
                            <p className="text-[9px] text-muted-foreground">Withheld</p>
                            <p className="text-xs font-mono font-semibold">{excludedLowQuality}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Active Learned Weights */}
            {perf && (perf.numeric_weights || perf.error_weights) && (
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Active Learned Weights
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground">Live values applied to every prediction</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Numeric Weights */}
                  {perf.numeric_weights && Object.keys(perf.numeric_weights).length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Numeric weights</p>
                      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                        {["home_bias_adjustment", "draw_calibration", "confidence_deflator", "ou_lambda_adjustment"].map((key) => {
                          const val = perf.numeric_weights?.[key];
                          if (val == null) return null;
                          const isHighlight = key === "draw_calibration";
                          return (
                            <div key={key} className={`rounded-lg p-3 border ${isHighlight ? "bg-primary/10 border-primary/30" : "bg-muted/40 border-border/50"}`}>
                              <p className="text-[10px] text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p>
                              <p className={`text-lg font-mono font-bold ${isHighlight ? "text-primary" : ""}`}>
                                {val > 0 ? "+" : ""}{Number(val).toFixed(3)}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Error Weights */}
                  {perf.error_weights && Object.keys(perf.error_weights).length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Error-based corrections</p>
                      <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
                        {Object.entries(perf.error_weights).map(([key, val]) => {
                          const num = Number(val);
                          const isPenalty = key.includes("penalty") || key.includes("overpredict");
                          const tone = num === 0
                            ? "bg-muted/40 border-border/50 text-muted-foreground"
                            : isPenalty
                              ? "bg-destructive/10 border-destructive/30 text-destructive"
                              : "bg-win/10 border-win/30 text-win";
                          return (
                            <div key={key} className={`rounded-lg p-3 border ${tone}`}>
                              <p className="text-[10px] opacity-80 capitalize">{key.replace(/_/g, " ")}</p>
                              <p className="text-lg font-mono font-bold">
                                {num > 0 ? "+" : ""}{num.toFixed(4)}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Lambda Shifts */}
                  {perf.numeric_weights && (() => {
                    const lambdaKeys = Object.entries(perf.numeric_weights).filter(([k]) => k.startsWith("league_lambda_shift_"));
                    if (lambdaKeys.length === 0) return null;
                    return (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">League lambda shifts</p>
                        <div className="flex flex-wrap gap-2">
                          {lambdaKeys.map(([key, val]) => {
                            const num = Number(val);
                            return (
                              <div key={key} className="flex items-center gap-2 rounded-md px-2.5 py-1 bg-muted/40 border border-border/50 text-xs">
                                <span className="text-muted-foreground capitalize">{key.replace("league_lambda_shift_", "").replace(/_/g, " ")}</span>
                                <span className={`font-mono font-semibold ${num < 0 ? "text-destructive" : "text-win"}`}>
                                  {num > 0 ? "+" : ""}{num.toFixed(3)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* League Penalties */}
                  {perf.numeric_weights && (() => {
                    const leagueKeys = Object.entries(perf.numeric_weights).filter(([k]) => k.startsWith("league_penalty_"));
                    if (leagueKeys.length === 0) return null;
                    return (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">League penalties</p>
                        <div className="flex flex-wrap gap-2">
                          {leagueKeys.map(([key, val]) => {
                            const num = Number(val);
                            return (
                              <div key={key} className="flex items-center gap-2 rounded-md px-2.5 py-1 bg-muted/40 border border-border/50 text-xs">
                                <span className="text-muted-foreground capitalize">{key.replace("league_penalty_", "").replace(/_/g, " ")}</span>
                                <span className={`font-mono font-semibold ${num < 0 ? "text-destructive" : "text-win"}`}>
                                  {num > 0 ? "+" : ""}{num.toFixed(3)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Per-Bucket Calibration Corrections */}
            {perf?.calibration_corrections && Object.keys(perf.calibration_corrections).length > 0 && (() => {
              const data = Object.entries(perf.calibration_corrections)
                .map(([band, val]) => ({ band, correction: Math.round(Number(val) * 1000) / 10, raw: Number(val) }))
                .sort((a, b) => a.band.localeCompare(b.band));
              return (
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      Calibration Corrections by Confidence Band
                    </CardTitle>
                    <p className="text-[10px] text-muted-foreground">Negative = confidence reduced (overconfident band) • Positive = boosted (underconfident)</p>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-44">
                      <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="band" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${v}pp`} />
                        <ChartTooltip content={<ChartTooltipContent formatter={(v: number) => `${v}pp`} />} />
                        <Bar dataKey="correction" radius={[4, 4, 4, 4]}>
                          {data.map((d, i) => (
                            <Cell key={i} fill={d.raw >= 0 ? "hsl(var(--win))" : "hsl(var(--destructive))"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Validation Diagnostics */}
            {perf?.validation_metrics && Object.keys(perf.validation_metrics).length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    Holdout Validation Diagnostics
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground">Recent unseen matches re-scored with active learned weights</p>
                </CardHeader>
                <CardContent className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                  {[
                    ["Old Brier", validationMetrics.old_composite_brier],
                    ["New Brier", validationMetrics.new_composite_brier],
                    ["1X2 Brier", validationMetrics.new_brier_1x2],
                    ["Confidence", validationMetrics.new_confidence_brier],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg border border-border/50 bg-muted/30 p-3">
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                      <p className="text-lg font-mono font-bold">{typeof value === "number" ? value.toFixed(4) : "—"}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Model Version History */}
            {perfHistory && perfHistory.length > 1 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Model Version History
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground">Last {perfHistory.length} learning cycles</p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/50 text-muted-foreground">
                          <th className="text-left font-medium py-2 px-2">Version</th>
                          <th className="text-left font-medium py-2 px-2">Created</th>
                          <th className="text-right font-medium py-2 px-2">Matches</th>
                          <th className="text-right font-medium py-2 px-2">1X2</th>
                          <th className="text-right font-medium py-2 px-2">O/U</th>
                          <th className="text-right font-medium py-2 px-2">BTTS</th>
                          <th className="text-center font-medium py-2 px-2">Validation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perfHistory.map((row) => {
                          const isActive = perf?.id === row.id;
                          const status = row.validation_result || "pending";
                          const statusColor =
                            status === "passed" ? "bg-win/15 text-win" :
                            status === "bootstrap" ? "bg-primary/15 text-primary" :
                            status === "failed" ? "bg-destructive/15 text-destructive" :
                            "bg-muted text-muted-foreground";
                          return (
                            <tr key={row.id} className={`border-b border-border/30 ${isActive ? "bg-primary/5" : ""}`}>
                              <td className="py-2 px-2 font-semibold">
                                v{row.model_version ?? "—"}
                                {isActive && <span className="ml-1.5 text-[9px] text-primary uppercase">active</span>}
                              </td>
                              <td className="py-2 px-2 text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                              <td className="py-2 px-2 text-right font-mono">{row.total_matches}</td>
                              <td className="py-2 px-2 text-right font-mono">{row.outcome_accuracy}%</td>
                              <td className="py-2 px-2 text-right font-mono">{row.ou_25_accuracy}%</td>
                              <td className="py-2 px-2 text-right font-mono">{row.btts_accuracy}%</td>
                              <td className="py-2 px-2 text-center">
                                <span className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase ${statusColor}`}>
                                  {status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Learning Trend Chart */}
            {trendData.length >= 2 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    Learning Trend
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground">Accuracy over successive computations</p>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-48">
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="period" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                      <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="outcome" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="1X2" />
                      <Line type="monotone" dataKey="ou" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} name="O/U" />
                      <Line type="monotone" dataKey="btts" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 3 }} name="BTTS" />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Charts Row */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Accuracy Breakdown */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Accuracy Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-44">
                    <BarChart data={summaryChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="accuracy" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Confidence Calibration */}
              {confCalData.length > 0 ? (
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Confidence Calibration</CardTitle>
                    <p className="text-[10px] text-muted-foreground">Predicted confidence vs actual hit rate (diagonal = perfect)</p>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-44">
                      <LineChart data={confCalData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="predicted" stroke="hsl(var(--muted-foreground))" fontSize={10} label={{ value: "Confidence %", position: "bottom", fontSize: 10 }} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} domain={[0, 100]} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line type="monotone" dataKey="predicted" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" dot={false} name="Perfect" />
                        <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} name="Actual" />
                      </LineChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              ) : calibrationData.length > 0 ? (
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Calibration Plot</CardTitle>
                    <p className="text-[10px] text-muted-foreground">Predicted vs actual hit rate (diagonal = perfect)</p>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-44">
                      <LineChart data={calibrationData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="predicted" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} domain={[0, 100]} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line type="monotone" dataKey="predicted" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" dot={false} name="Perfect" />
                        <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} name="Actual" />
                      </LineChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            {/* Error Patterns + League Breakdown Row */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Error Patterns */}
              {errorPatterns.length > 0 && (
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      Error Patterns
                    </CardTitle>
                    <p className="text-[10px] text-muted-foreground">Most common prediction mistakes</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {errorPatterns.slice(0, 8).map((ep) => (
                      <div key={ep.type} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{ep.type.replace(/_/g, " ")}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-destructive/70"
                              style={{ width: `${Math.min(100, ep.pct * 2)}%` }}
                            />
                          </div>
                          <span className="font-mono w-10 text-right">{ep.count}×</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* League Breakdown */}
              {leagueBreakdown.length > 0 && (
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Per-League Accuracy</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {leagueBreakdown.map((lb) => (
                      <div key={lb.league} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate max-w-[140px]">{lb.league}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${lb.accuracy >= 50 ? "bg-primary" : lb.accuracy >= 35 ? "bg-yellow-500" : "bg-destructive"}`}
                              style={{ width: `${lb.accuracy}%` }}
                            />
                          </div>
                          <span className="font-mono w-16 text-right">{lb.accuracy}% ({lb.total})</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Goal Line Accuracy */}
            {goalLineData.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Goal Line Accuracy</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-40">
                    <BarChart data={goalLineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="accuracy" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Weak Areas */}
            {perf?.weak_areas && perf.weak_areas.length > 0 && (
              <Card className="border-border/50 border-destructive/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Weak Areas & Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {perf.weak_areas.map((w, i) => (
                    <div key={i} className="text-xs text-muted-foreground bg-destructive/5 rounded p-2">
                      {w}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Brier Score Breakdown */}
            {perf && (
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Brier Score Breakdown (lower = better)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "1X2", value: perf.avg_brier_1x2, color: "primary" },
                      { label: "O/U", value: perf.avg_brier_ou, color: "chart-2" },
                      { label: "BTTS", value: perf.avg_brier_btts, color: "chart-3" },
                    ].map((b) => (
                      <div key={b.label} className="text-center">
                        <p className="text-lg font-bold">{b.value}</p>
                        <div className="h-1.5 rounded-full bg-muted mt-1">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(5, 100 - b.value * 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{b.label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Match-by-Match */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Match-by-Match</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 max-h-96 overflow-y-auto">
                {completed?.filter(m => m.prediction && m.goals_home != null).map((m) => {
                  const pred = m.prediction!;
                  const actualHome = m.goals_home! > m.goals_away!;
                  const actualDraw = m.goals_home === m.goals_away;
                  const predHome = Number(pred.home_win) > Number(pred.draw) && Number(pred.home_win) > Number(pred.away_win);
                  const predDraw = Number(pred.draw) > Number(pred.home_win) && Number(pred.draw) > Number(pred.away_win);
                  const predAway = !predHome && !predDraw;
                  const actualAway = !actualHome && !actualDraw;
                  const correct = (actualHome && predHome) || (actualDraw && predDraw) || (actualAway && predAway);
                  const totalGoals = m.goals_home! + m.goals_away!;
                  const ouCorrect = (totalGoals > 2.5 && pred.over_under_25 === "over") || (totalGoals <= 2.5 && pred.over_under_25 !== "over");
                  const score = m.ai_accuracy_score;

                  return (
                    <div key={m.id} className="flex items-center justify-between rounded-lg bg-muted p-2 text-xs gap-2">
                      <span className="truncate flex-1">
                        {m.home_team?.name} {m.goals_home}-{m.goals_away} {m.away_team?.name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {score != null && (
                          <span className={`text-[10px] font-mono ${score >= 60 ? "text-win" : score >= 40 ? "text-draw" : "text-destructive"}`}>
                            {score}
                          </span>
                        )}
                        <Badge variant={correct ? "default" : "destructive"} className="text-[10px]">
                          1X2 {correct ? "✓" : "✗"}
                        </Badge>
                        <Badge variant={ouCorrect ? "default" : "destructive"} className="text-[10px]">
                          O/U {ouCorrect ? "✓" : "✗"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
