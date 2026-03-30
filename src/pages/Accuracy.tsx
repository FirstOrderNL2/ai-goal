import { Header } from "@/components/Header";
import { useCompletedMatches } from "@/hooks/useMatches";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { CheckCircle, XCircle, Target } from "lucide-react";

export default function Accuracy() {
  const { data: completed, isLoading } = useCompletedMatches();

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

          if ((actualHome && predHome) || (actualDraw && predDraw) || (actualAway && predAway)) {
            acc.correct++;
          }

          const totalGoals = m.goals_home + m.goals_away;
          const predOver = pred.over_under_25 === "over";
          if ((totalGoals > 2.5 && predOver) || (totalGoals <= 2.5 && !predOver)) {
            acc.ouCorrect++;
          }
          acc.ouTotal++;

          return acc;
        },
        { total: 0, correct: 0, ouTotal: 0, ouCorrect: 0 },
      )
    : null;

  const accuracy = stats && stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const ouAccuracy = stats && stats.ouTotal > 0 ? Math.round((stats.ouCorrect / stats.ouTotal) * 100) : 0;

  const chartData = [
    { name: "1X2", accuracy, fill: "hsl(var(--primary))" },
    { name: "O/U 2.5", accuracy: ouAccuracy, fill: "hsl(var(--chart-2))" },
  ];

  const chartConfig = {
    accuracy: { label: "Accuracy %", color: "hsl(var(--primary))" },
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 space-y-6 max-w-3xl">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Prediction <span className="text-primary">Accuracy</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            How our mock prediction engine performed against actual results.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : stats ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="border-border/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <Target className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{accuracy}%</p>
                    <p className="text-xs text-muted-foreground">1X2 Accuracy</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle className="h-8 w-8 text-win" />
                  <div>
                    <p className="text-2xl font-bold">{stats.correct}/{stats.total}</p>
                    <p className="text-xs text-muted-foreground">Correct Predictions</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <XCircle className="h-8 w-8 text-draw" />
                  <div>
                    <p className="text-2xl font-bold">{ouAccuracy}%</p>
                    <p className="text-xs text-muted-foreground">O/U 2.5 Accuracy</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Accuracy Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-48">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="accuracy" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Match-by-match */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Match-by-Match</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                {completed?.filter(m => m.prediction && m.goals_home != null).map((m) => {
                  const pred = m.prediction!;
                  const actualHome = m.goals_home! > m.goals_away!;
                  const actualDraw = m.goals_home === m.goals_away;
                  const predHome = Number(pred.home_win) > Number(pred.draw) && Number(pred.home_win) > Number(pred.away_win);
                  const predDraw = Number(pred.draw) > Number(pred.home_win) && Number(pred.draw) > Number(pred.away_win);
                  const predAway = !predHome && !predDraw;
                  const actualAway = !actualHome && !actualDraw;
                  const correct = (actualHome && predHome) || (actualDraw && predDraw) || (actualAway && predAway);

                  return (
                    <div key={m.id} className="flex items-center justify-between rounded-lg bg-muted p-2 text-sm">
                      <span className="truncate flex-1">
                        {m.home_team?.name} {m.goals_home}-{m.goals_away} {m.away_team?.name}
                      </span>
                      <Badge variant={correct ? "default" : "destructive"} className="text-[10px] ml-2">
                        {correct ? "✓" : "✗"}
                      </Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No data available.</p>
        )}
      </main>
    </div>
  );
}
