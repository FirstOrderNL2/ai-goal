import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Users, CheckCircle2, AlertTriangle } from "lucide-react";
import { useEffect } from "react";

interface AICommunityComparisonCardProps {
  predictionId: string;
  prediction: {
    home_win: number;
    draw: number;
    away_win: number;
    model_confidence: number;
    predicted_score_home: number | null;
    predicted_score_away: number | null;
  };
  homeTeamName: string;
  awayTeamName: string;
}

export function AICommunityComparisonCard({
  predictionId,
  prediction,
  homeTeamName,
  awayTeamName,
}: AICommunityComparisonCardProps) {
  const { data: votes, refetch } = useQuery({
    queryKey: ["comparison-votes", predictionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prediction_votes")
        .select("vote_type")
        .eq("prediction_id", predictionId);
      if (error) throw error;
      const likes = data.filter((v) => v.vote_type === "like").length;
      const dislikes = data.filter((v) => v.vote_type === "dislike").length;
      return { likes, dislikes, total: likes + dislikes };
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`comparison-votes-${predictionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "prediction_votes", filter: `prediction_id=eq.${predictionId}` }, () => {
        refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [predictionId, refetch]);

  if (!votes || votes.total === 0) return null;

  const communityPct = Math.round((votes.likes / votes.total) * 100);
  const isAligned = communityPct >= 50;

  // AI prediction summary
  const hw = Number(prediction.home_win);
  const d = Number(prediction.draw);
  const aw = Number(prediction.away_win);
  const maxProb = Math.max(hw, d, aw);
  const aiOutcome = maxProb === hw ? `${homeTeamName} Win` : maxProb === aw ? `${awayTeamName} Win` : "Draw";
  const aiPct = Math.round(maxProb * 100);

  const confidence = Math.round(Number(prediction.model_confidence) * 100);
  const confTier = confidence >= 70 ? "High 🟢" : confidence >= 40 ? "Medium 🟡" : "Low 🔴";

  const communitySentiment = communityPct >= 70 ? "Strong Support 🟢" : communityPct >= 50 ? "Moderate Support 🟡" : communityPct >= 30 ? "Skeptical 🟠" : "Against 🔴";

  return (
    <Card className={`border-border/50 ${isAligned ? "ring-1 ring-green-500/30" : "ring-1 ring-amber-500/30"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            AI vs Community
          </CardTitle>
          <Badge variant={isAligned ? "default" : "secondary"} className={isAligned ? "bg-green-500/20 text-green-500 border-green-500/30" : "bg-amber-500/20 text-amber-500 border-amber-500/30"}>
            {isAligned ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Aligned</> : <><AlertTriangle className="h-3 w-3 mr-1" /> Divergent</>}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 text-sm">
          {/* Header row */}
          <div className="text-muted-foreground font-medium" />
          <div className="flex items-center gap-1 font-semibold text-primary justify-center">
            <Brain className="h-3 w-3" /> AI
          </div>
          <div className="flex items-center gap-1 font-semibold text-primary justify-center">
            <Users className="h-3 w-3" /> Community
          </div>

          {/* Prediction */}
          <div className="text-muted-foreground py-2">Prediction</div>
          <div className="text-center py-2 font-medium">{aiOutcome} ({aiPct}%)</div>
          <div className="text-center py-2 font-medium">👍 {communityPct}% support</div>

          {/* Confidence */}
          <div className="text-muted-foreground py-2 border-t border-border/50">Confidence</div>
          <div className="text-center py-2 border-t border-border/50">{confTier}</div>
          <div className="text-center py-2 border-t border-border/50">{communitySentiment}</div>

          {/* Score */}
          <div className="text-muted-foreground py-2 border-t border-border/50">Predicted Score</div>
          <div className="text-center py-2 border-t border-border/50 font-mono font-semibold">
            {prediction.predicted_score_home ?? "?"} - {prediction.predicted_score_away ?? "?"}
          </div>
          <div className="text-center py-2 border-t border-border/50 text-muted-foreground">—</div>

          {/* Votes */}
          <div className="text-muted-foreground py-2 border-t border-border/50">Sample Size</div>
          <div className="text-center py-2 border-t border-border/50 text-muted-foreground">—</div>
          <div className="text-center py-2 border-t border-border/50">{votes.total} vote{votes.total !== 1 ? "s" : ""}</div>
        </div>
      </CardContent>
    </Card>
  );
}
