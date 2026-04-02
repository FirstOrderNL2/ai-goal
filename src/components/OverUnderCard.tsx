import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Target } from "lucide-react";
import type { Prediction, MatchFeatures } from "@/lib/types";

interface Props {
  prediction: Prediction;
  features?: MatchFeatures | null;
}

function GaugeBar({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold">{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function OverUnderCard({ prediction, features }: Props) {
  const isOver = prediction.over_under_25 === "over";
  const isBtts = prediction.btts === "yes";

  // Compute approximate O/U probability from features if available
  const homeXg = Number(features?.poisson_xg_home ?? prediction.expected_goals_home ?? 0);
  const awayXg = Number(features?.poisson_xg_away ?? prediction.expected_goals_away ?? 0);
  const totalXg = homeXg + awayXg;
  // Simple approximation: if total xG > 2.5, lean over
  const overProb = Math.min(Math.max(totalXg / 5, 0.2), 0.85);

  // BTTS prob from features
  const homeBtts = Number(features?.home_btts_pct ?? 0.5);
  const awayBtts = Number(features?.away_btts_pct ?? 0.5);
  const bttsProb = (homeBtts + awayBtts) / 2;

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
          <GaugeBar value={overProb} label="Over probability" color="bg-green-500" />
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
          <GaugeBar value={bttsProb} label="BTTS probability" color="bg-amber-500" />
          <p className="text-[10px] text-muted-foreground text-center">
            Home BTTS: {Math.round(homeBtts * 100)}% · Away: {Math.round(awayBtts * 100)}%
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
