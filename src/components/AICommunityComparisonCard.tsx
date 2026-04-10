import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Users, CheckCircle2, AlertTriangle, Shield } from "lucide-react";
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
        .select("vote_type, user_id")
        .eq("prediction_id", predictionId);
      if (error) throw error;

      // Fetch trust scores for voters
      const userIds = [...new Set(data.map((v) => v.user_id))];
      const { data: perfData } = userIds.length > 0
        ? await supabase.from("user_performance").select("user_id, trust_score").in("user_id", userIds)
        : { data: [] };

      const trustMap = new Map<string, number>();
      for (const p of perfData || []) {
        trustMap.set(p.user_id, Number(p.trust_score));
      }

      let weightedLikes = 0;
      let weightedTotal = 0;
      let likes = 0;
      let dislikes = 0;

      for (const v of data) {
        const trust = trustMap.get(v.user_id) ?? 0.5;
        if (v.vote_type === "like") {
          likes++;
          weightedLikes += trust;
        } else {
          dislikes++;
        }
        weightedTotal += trust;
      }

      return {
        likes,
        dislikes,
        total: likes + dislikes,
        weightedPct: weightedTotal > 0 ? Math.round((weightedLikes / weightedTotal) * 100) : 0,
        rawPct: (likes + dislikes) > 0 ? Math.round((likes / (likes + dislikes)) * 100) : 0,
        hasWeights: (perfData || []).length > 0,
      };
    },
  });

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

  const communityPct = votes.hasWeights ? votes.weightedPct : votes.rawPct;
  const isAligned = communityPct >= 50;

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
          <div className="flex items-center gap-2">
            {votes.hasWeights && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Shield className="h-2.5 w-2.5" /> Weighted
              </Badge>
            )}
            <Badge variant={isAligned ? "default" : "secondary"} className={isAligned ? "bg-green-500/20 text-green-500 border-green-500/30" : "bg-amber-500/20 text-amber-500 border-amber-500/30"}>
              {isAligned ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Aligned</> : <><AlertTriangle className="h-3 w-3 mr-1" /> Divergent</>}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="text-muted-foreground font-medium" />
          <div className="flex items-center gap-1 font-semibold text-primary justify-center">
            <Brain className="h-3 w-3" /> AI
          </div>
          <div className="flex items-center gap-1 font-semibold text-primary justify-center">
            <Users className="h-3 w-3" /> Community
          </div>

          <div className="text-muted-foreground py-2">Prediction</div>
          <div className="text-center py-2 font-medium">{aiOutcome} ({aiPct}%)</div>
          <div className="text-center py-2 font-medium">👍 {communityPct}% support</div>

          <div className="text-muted-foreground py-2 border-t border-border/50">Confidence</div>
          <div className="text-center py-2 border-t border-border/50">{confTier}</div>
          <div className="text-center py-2 border-t border-border/50">{communitySentiment}</div>

          <div className="text-muted-foreground py-2 border-t border-border/50">Predicted Score</div>
          <div className="text-center py-2 border-t border-border/50 font-mono font-semibold">
            {prediction.predicted_score_home ?? "?"} - {prediction.predicted_score_away ?? "?"}
          </div>
          <div className="text-center py-2 border-t border-border/50 text-muted-foreground">—</div>

          <div className="text-muted-foreground py-2 border-t border-border/50">Sample Size</div>
          <div className="text-center py-2 border-t border-border/50 text-muted-foreground">—</div>
          <div className="text-center py-2 border-t border-border/50">{votes.total} vote{votes.total !== 1 ? "s" : ""}</div>
        </div>

        {votes.hasWeights && votes.rawPct !== votes.weightedPct && (
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Raw: {votes.rawPct}% → Weighted: {votes.weightedPct}% (adjusted by user accuracy)
          </p>
        )}
      </CardContent>
    </Card>
  );
}
