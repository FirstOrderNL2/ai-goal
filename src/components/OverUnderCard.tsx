import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Target, Star, TrendingUp } from "lucide-react";
import type { Prediction, MatchFeatures } from "@/lib/types";

interface Props {
  prediction: Prediction;
  features?: MatchFeatures | null;
}

const GOAL_LINE_LABELS: Record<string, string> = {
  over_0_5: "Over 0.5",
  over_1_5: "Over 1.5",
  over_2_5: "Over 2.5",
  over_3_5: "Over 3.5",
  over_4_5: "Over 4.5",
};

function GaugeBar({ value, label, isBest }: { value: number; label: string; isBest?: boolean }) {
  const pct = Math.round(value * 100);
  const barColor = pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className={`flex items-center gap-3 rounded-lg p-2.5 transition-all ${isBest ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/30"}`}>
      {isBest && <Star className="h-3.5 w-3.5 text-primary shrink-0" />}
      <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums w-10 text-right">{pct}%</span>
    </div>
  );
}

export function OverUnderCard({ prediction, features }: Props) {
  const goalLines = prediction.goal_lines as Record<string, number> | null;
  const bestPick = prediction.best_pick;
  const isBtts = prediction.btts === "yes";

  // Compute approximate values from features if goal_lines not available
  const homeXg = Number(features?.poisson_xg_home ?? prediction.expected_goals_home ?? 0);
  const awayXg = Number(features?.poisson_xg_away ?? prediction.expected_goals_away ?? 0);
  const totalXg = homeXg + awayXg;

  // BTTS prob from features
  const homeBtts = Number(features?.home_btts_pct ?? 0.5);
  const awayBtts = Number(features?.away_btts_pct ?? 0.5);
  const bttsProb = (homeBtts + awayBtts) / 2;

  // If we have structured goal_lines, show the full multi-line view
  if (goalLines && Object.keys(goalLines).length > 0) {
    return (
      <div className="space-y-3">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              Goal Line Probabilities
              {bestPick && (
                <Badge variant="default" className="ml-auto text-[10px]">
                  <Star className="h-3 w-3 mr-1" />
                  Best: {bestPick}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {Object.entries(GOAL_LINE_LABELS).map(([key, label]) => {
              const value = goalLines[key] ?? 0;
              const isBestLine = bestPick?.toLowerCase().replace(/ /g, "_").replace(".", "_") === key;
              return (
                <GaugeBar key={key} value={value} label={label} isBest={isBestLine} />
              );
            })}
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              Combined xG: {totalXg.toFixed(1)} · Poisson-derived probabilities
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Both Teams Score</span>
            </div>
            <div className="text-center">
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${
                isBtts ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
              }`}>
                BTTS {isBtts ? "Yes" : "No"}
              </span>
            </div>
            <GaugeBar value={bttsProb} label="BTTS %" />
            <p className="text-[10px] text-muted-foreground text-center">
              Home BTTS: {Math.round(homeBtts * 100)}% · Away: {Math.round(awayBtts * 100)}%
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback: legacy single O/U 2.5 view
  const isOver = prediction.over_under_25 === "over";
  const overProb = Math.min(Math.max(totalXg / 5, 0.2), 0.85);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="border-border/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Over/Under 2.5</span>
          </div>
          <div className="text-center">
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${
              isOver ? "bg-green-500/20 text-green-500" : "bg-blue-500/20 text-blue-500"
            }`}>
              {isOver ? "Over" : "Under"} 2.5
            </span>
          </div>
          <GaugeBar value={overProb} label="Over %" />
          <p className="text-[10px] text-muted-foreground text-center">
            Combined xG: {totalXg.toFixed(1)}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Both Teams Score</span>
          </div>
          <div className="text-center">
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${
              isBtts ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
            }`}>
              BTTS {isBtts ? "Yes" : "No"}
            </span>
          </div>
          <GaugeBar value={bttsProb} label="BTTS %" />
          <p className="text-[10px] text-muted-foreground text-center">
            Home BTTS: {Math.round(homeBtts * 100)}% · Away: {Math.round(awayBtts * 100)}%
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
