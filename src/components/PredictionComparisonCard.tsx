import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProbabilityBar } from "./ProbabilityBar";
import type { Prediction } from "@/lib/types";
import { GitCompareArrows, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  prediction: Prediction;
  homeTeamName: string;
  awayTeamName: string;
}

export function PredictionComparisonCard({ prediction, homeTeamName, awayTeamName }: Props) {
  const snapshot = prediction.pre_match_snapshot as Record<string, unknown> | null;
  if (!snapshot) return null;

  const pre = {
    home_win: Number(snapshot.home_win ?? 0),
    draw: Number(snapshot.draw ?? 0),
    away_win: Number(snapshot.away_win ?? 0),
    xg_home: Number(snapshot.expected_goals_home ?? 0),
    xg_away: Number(snapshot.expected_goals_away ?? 0),
    confidence: Number(snapshot.model_confidence ?? 0),
    over_under: snapshot.over_under_25 as string | undefined,
    btts: snapshot.btts as string | undefined,
    best_pick: snapshot.best_pick as string | undefined,
    predicted_home: snapshot.predicted_score_home as number | null,
    predicted_away: snapshot.predicted_score_away as number | null,
  };

  const ht = {
    home_win: Number(prediction.home_win),
    draw: Number(prediction.draw),
    away_win: Number(prediction.away_win),
    xg_home: Number(prediction.expected_goals_home),
    xg_away: Number(prediction.expected_goals_away),
    confidence: Number(prediction.model_confidence),
    over_under: prediction.over_under_25,
    btts: prediction.btts,
    best_pick: prediction.best_pick,
    predicted_home: prediction.predicted_score_home,
    predicted_away: prediction.predicted_score_away,
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompareArrows className="h-4 w-4 text-primary" />
          Pre-Match vs Halftime Prediction
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Probability comparison */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pre-Match</p>
          <ProbabilityBar homeWin={pre.home_win} draw={pre.draw} awayWin={pre.away_win} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Halftime</p>
            <Badge variant="secondary" className="text-[10px]">Current</Badge>
          </div>
          <ProbabilityBar homeWin={ht.home_win} draw={ht.draw} awayWin={ht.away_win} />
        </div>

        {/* Shift indicators */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: homeTeamName, prePct: pre.home_win, htPct: ht.home_win },
            { label: "Draw", prePct: pre.draw, htPct: ht.draw },
            { label: awayTeamName, prePct: pre.away_win, htPct: ht.away_win },
          ].map(({ label, prePct, htPct }) => {
            const delta = Math.round((htPct - prePct) * 100);
            return (
              <div key={label} className="rounded-lg bg-muted p-3 space-y-1">
                <p className="text-xs text-muted-foreground truncate">{label}</p>
                <p className="text-lg font-bold">{Math.round(htPct * 100)}%</p>
                <DeltaBadge delta={delta} suffix="%" />
              </div>
            );
          })}
        </div>

        {/* xG & confidence shifts */}
        <div className="grid grid-cols-2 gap-3">
          <ComparisonRow
            label="Expected Goals"
            preValue={`${pre.xg_home.toFixed(1)} - ${pre.xg_away.toFixed(1)}`}
            htValue={`${ht.xg_home.toFixed(1)} - ${ht.xg_away.toFixed(1)}`}
          />
          <ComparisonRow
            label="Confidence"
            preValue={`${Math.round(pre.confidence * 100)}%`}
            htValue={`${Math.round(ht.confidence * 100)}%`}
            delta={Math.round((ht.confidence - pre.confidence) * 100)}
          />
        </div>

        {/* Pick changes */}
        {(pre.best_pick || ht.best_pick) && pre.best_pick !== ht.best_pick && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3">
            <GitCompareArrows className="h-4 w-4 text-primary shrink-0" />
            <p className="text-sm">
              Pick changed from <span className="font-semibold">{pre.best_pick || "—"}</span> to{" "}
              <span className="font-semibold text-primary">{ht.best_pick || "—"}</span>
            </p>
          </div>
        )}

        {/* O/U & BTTS changes */}
        <div className="flex gap-3 flex-wrap">
          {pre.over_under !== ht.over_under && (
            <Badge variant="outline" className="text-xs">
              O/U 2.5: {pre.over_under} → {ht.over_under}
            </Badge>
          )}
          {pre.btts !== ht.btts && (
            <Badge variant="outline" className="text-xs">
              BTTS: {pre.btts} → {ht.btts}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DeltaBadge({ delta, suffix = "" }: { delta: number; suffix?: string }) {
  if (delta === 0) return <span className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><Minus className="h-2.5 w-2.5" />0{suffix}</span>;
  const isUp = delta > 0;
  return (
    <span className={`text-[10px] font-semibold flex items-center justify-center gap-0.5 ${isUp ? "text-green-500" : "text-destructive"}`}>
      {isUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {isUp ? "+" : ""}{delta}{suffix}
    </span>
  );
}

function ComparisonRow({ label, preValue, htValue, delta }: { label: string; preValue: string; htValue: string; delta?: number }) {
  return (
    <div className="rounded-lg bg-muted p-3 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold">{htValue}</span>
        <span className="text-[10px] text-muted-foreground line-through">{preValue}</span>
      </div>
      {delta != null && <DeltaBadge delta={delta} suffix="%" />}
    </div>
  );
}
