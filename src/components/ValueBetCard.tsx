import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, AlertTriangle, XCircle, TrendingUp } from "lucide-react";

interface ValueBetCardProps {
  prediction: {
    home_win: number;
    draw: number;
    away_win: number;
  };
  odds: {
    home_win_odds: number;
    draw_odds: number;
    away_win_odds: number;
  };
  homeTeamName: string;
  awayTeamName: string;
  communityAgreement?: number | null; // 0-100
}

interface ValuePick {
  label: string;
  modelProb: number;
  impliedProb: number;
  value: number;
  odds: number;
}

export function ValueBetCard({ prediction, odds, homeTeamName, awayTeamName, communityAgreement }: ValueBetCardProps) {
  const picks: ValuePick[] = [
    {
      label: `${homeTeamName} Win`,
      modelProb: Number(prediction.home_win),
      impliedProb: 1 / Number(odds.home_win_odds),
      value: Number(prediction.home_win) - 1 / Number(odds.home_win_odds),
      odds: Number(odds.home_win_odds),
    },
    {
      label: "Draw",
      modelProb: Number(prediction.draw),
      impliedProb: 1 / Number(odds.draw_odds),
      value: Number(prediction.draw) - 1 / Number(odds.draw_odds),
      odds: Number(odds.draw_odds),
    },
    {
      label: `${awayTeamName} Win`,
      modelProb: Number(prediction.away_win),
      impliedProb: 1 / Number(odds.away_win_odds),
      value: Number(prediction.away_win) - 1 / Number(odds.away_win_odds),
      odds: Number(odds.away_win_odds),
    },
  ].sort((a, b) => b.value - a.value);

  const bestPick = picks[0];
  const hasHighValue = bestPick.value > 0.1;
  const hasMarginalValue = bestPick.value > 0.05;

  const getIcon = (value: number) => {
    if (value > 0.1) return <Flame className="h-4 w-4 text-orange-500" />;
    if (value > 0.05) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <XCircle className="h-4 w-4 text-muted-foreground" />;
  };

  const getLabel = (value: number) => {
    if (value > 0.1) return { text: "🔥 High Value", className: "bg-orange-500/20 text-orange-500 border-orange-500/30" };
    if (value > 0.05) return { text: "⚠️ Marginal", className: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30" };
    return { text: "❌ No Value", className: "bg-muted text-muted-foreground" };
  };

  return (
    <Card className={`border-border/50 ${hasHighValue ? "ring-1 ring-orange-500/30" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Value Bet Detection
          </CardTitle>
          {hasHighValue && (
            <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/30">
              <Flame className="h-3 w-3 mr-1" /> Value Found
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {picks.map((pick) => {
          const label = getLabel(pick.value);
          return (
            <div key={pick.label} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-2">
                {getIcon(pick.value)}
                <div>
                  <p className="text-sm font-medium">{pick.label}</p>
                  <p className="text-xs text-muted-foreground">
                    AI: {Math.round(pick.modelProb * 100)}% · Odds: {pick.odds.toFixed(2)} ({Math.round(pick.impliedProb * 100)}%)
                  </p>
                </div>
              </div>
              <div className="text-right">
                <Badge variant="outline" className={label.className}>
                  {label.text}
                </Badge>
                <p className={`text-xs font-mono mt-1 ${pick.value > 0 ? "text-green-500" : "text-destructive"}`}>
                  {pick.value > 0 ? "+" : ""}{Math.round(pick.value * 100)}%
                </p>
              </div>
            </div>
          );
        })}

        {communityAgreement != null && (
          <div className="text-xs text-muted-foreground text-center pt-1 border-t border-border/50">
            Community agreement with best pick: <span className={`font-semibold ${communityAgreement >= 60 ? "text-green-500" : communityAgreement >= 40 ? "text-yellow-500" : "text-destructive"}`}>{communityAgreement}%</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
