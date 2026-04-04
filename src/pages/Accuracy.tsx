import { Header } from "@/components/Header";
import { useCompletedMatches } from "@/hooks/useMatches";
import { useLatestPerformance } from "@/hooks/useModelPerformance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, ScatterChart, Scatter, ResponsiveContainer } from "recharts";
import { CheckCircle, XCircle, Target, TrendingUp, AlertTriangle, BarChart3, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

export default function Accuracy() {
  const { data: completed, isLoading } = useCompletedMatches();
  const { data: perf, isLoading: perfLoading } = useLatestPerformance();
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

  const chartConfig = {
    accuracy: { label: "Accuracy %", color: "hsl(var(--primary))" },
    predicted: { label: "Predicted", color: "hsl(var(--primary))" },
    actual: { label: "Actual", color: "hsl(var(--chart-2))" },
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
    } catch (e) { console.error(e); }
    setReviewing(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              AI <span className="text-primary">Performance</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {totalMatches} matches evaluated • {perf ? `Last computed ${new Date(perf.created_at).toLocaleDateString()}` : "Live computation from match data"}
            </p>
          </div>
          <div className="flex gap-2">
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

              {/* Calibration Chart */}
              {calibrationData.length > 0 && (
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Calibration Plot</CardTitle>
                    <p className="text-[10px] text-muted-foreground">Predicted vs actual hit rate (diagonal = perfect)</p>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-44">
                      <LineChart data={calibrationData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="predicted" stroke="hsl(var(--muted-foreground))" fontSize={10} label={{ value: "Predicted %", position: "bottom", fontSize: 10 }} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} domain={[0, 100]} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line type="monotone" dataKey="predicted" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" dot={false} name="Perfect" />
                        <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} name="Actual" />
                      </LineChart>
                    </ChartContainer>
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
