import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Target, BarChart3, Zap } from "lucide-react";
import type { Prediction } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AIVerdictCardProps {
  prediction: Prediction;
  homeTeamName: string;
  awayTeamName: string;
}

export function AIVerdictCard({ prediction, homeTeamName, awayTeamName }: AIVerdictCardProps) {
  const hw = Number(prediction.home_win);
  const dr = Number(prediction.draw);
  const aw = Number(prediction.away_win);
  const confidence = Math.round(Number(prediction.model_confidence) * 100);
  const hasPredictedScore = prediction.predicted_score_home != null && prediction.predicted_score_away != null;

  // Determine predicted winner
  let winner: string;
  let winnerColor: string;
  if (hw > aw && hw > dr) {
    winner = homeTeamName;
    winnerColor = "text-emerald-400";
  } else if (aw > hw && aw > dr) {
    winner = awayTeamName;
    winnerColor = "text-blue-400";
  } else {
    winner = "Draw";
    winnerColor = "text-yellow-400";
  }

  // Parse reasoning sections from ai_reasoning
  const reasoning = prediction.ai_reasoning || "";
  const sections = parseReasoningSections(reasoning);

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4 text-primary" />
          AI Verdict
          <Badge variant="outline" className="ml-auto text-xs">
            {confidence}% confident
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main verdict row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-muted/50 p-3 space-y-1">
            <Trophy className="h-4 w-4 mx-auto text-primary" />
            <p className={cn("text-sm font-bold", winnerColor)}>{winner}</p>
            <p className="text-[10px] text-muted-foreground">Predicted Winner</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 space-y-1">
            <Target className="h-4 w-4 mx-auto text-primary" />
            <p className="text-lg font-bold tabular-nums">
              {hasPredictedScore
                ? `${prediction.predicted_score_home} - ${prediction.predicted_score_away}`
                : `${Number(prediction.expected_goals_home).toFixed(1)} - ${Number(prediction.expected_goals_away).toFixed(1)}`}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {hasPredictedScore ? "Predicted Score" : "Expected Goals"}
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 space-y-1">
            <BarChart3 className="h-4 w-4 mx-auto text-primary" />
            <div className="flex gap-1.5 justify-center">
              <Badge variant={prediction.btts === "yes" ? "default" : "outline"} className="text-[10px] px-1.5 py-0">
                BTTS {prediction.btts === "yes" ? "✓" : "✗"}
              </Badge>
            </div>
            <Badge
              variant={prediction.over_under_25 === "over" ? "default" : "outline"}
              className="text-[10px] px-1.5 py-0"
            >
              {prediction.over_under_25 === "over" ? "Over" : "Under"} 2.5
            </Badge>
          </div>
        </div>

        {/* Reasoning sections */}
        {sections.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-semibold text-foreground">Why?</p>
            </div>
            {sections.map((section, i) => (
              <div key={i} className="space-y-1">
                {section.title && (
                  <p className="text-xs font-semibold text-muted-foreground">{section.title}</p>
                )}
                <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-line">
                  {section.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function parseReasoningSections(text: string): { title: string; content: string }[] {
  if (!text) return [];
  
  // Split by emoji headers like "🏆 WINNER ANALYSIS:", "⚽ BTTS", etc.
  const parts = text.split(/\n(?=[\u{1F3C6}\u{26BD}\u{1F4CA}\u{1F511}\u{1F4A1}\u{1F525}\u{1F50D}\u{1F3AF}])/u);
  
  return parts
    .map(part => {
      const lines = part.trim().split("\n");
      const title = lines[0]?.replace(/^[^\w]*/, "").trim() || "";
      const content = lines.slice(1).join("\n").trim();
      return { title, content };
    })
    .filter(s => s.content.length > 0);
}
