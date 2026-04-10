import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Database, Users, Zap } from "lucide-react";
import type { Prediction, MatchFeatures, MatchContext } from "@/lib/types";

interface ConfidenceEngineCardProps {
  prediction: Prediction;
  features: MatchFeatures | null | undefined;
  matchContext: MatchContext | null | undefined;
  matchId: string;
}

function computeStatCertainty(p: Prediction): number {
  const probs = [Number(p.home_win), Number(p.draw), Number(p.away_win)].sort((a, b) => b - a);
  const gap = probs[0] - probs[1];
  // gap ranges from 0 to ~0.8; normalize to 0-1
  return Math.min(gap / 0.5, 1);
}

function computeDataQuality(
  features: MatchFeatures | null | undefined,
  ctx: MatchContext | null | undefined,
  refereeName: string | null
): number {
  let score = 0;
  let total = 5;

  if (features?.home_form_last5) score++;
  if (features?.h2h_results && (features.h2h_results as any[]).length > 0) score++;
  if (features?.league_position_home != null) score++;

  const hasLineups =
    ctx &&
    ((ctx.lineup_home as any[])?.length > 0 || (ctx.lineup_away as any[])?.length > 0);
  if (hasLineups) score++;

  if (refereeName) score++;

  return score / total;
}

function computeCommunityAlignment(
  aiPick: string | null,
  votes: { agree: number; disagree: number }
): number {
  const total = votes.agree + votes.disagree;
  if (total === 0) return 0.5; // neutral when no votes
  return votes.agree / total;
}

function getAiPick(p: Prediction): string {
  const probs = [
    { label: "home", val: Number(p.home_win) },
    { label: "draw", val: Number(p.draw) },
    { label: "away", val: Number(p.away_win) },
  ];
  return probs.sort((a, b) => b.val - a.val)[0].label;
}

const PILLAR_CONFIG = [
  { key: "stat", label: "Statistical Certainty", weight: 0.4, icon: ShieldCheck, color: "text-blue-400" },
  { key: "quality", label: "Data Quality", weight: 0.2, icon: Database, color: "text-amber-400" },
  { key: "alignment", label: "Community Alignment", weight: 0.2, icon: Users, color: "text-purple-400" },
  { key: "volatility", label: "Volatility Adjustment", weight: 0.2, icon: Zap, color: "text-cyan-400" },
] as const;

function scoreColor(score: number): string {
  if (score >= 0.7) return "text-green-400";
  if (score >= 0.4) return "text-yellow-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 0.7) return "bg-green-500/20 border-green-500/30";
  if (score >= 0.4) return "bg-yellow-500/20 border-yellow-500/30";
  return "bg-red-500/20 border-red-500/30";
}

function scoreLabel(score: number): string {
  if (score >= 0.7) return "High";
  if (score >= 0.4) return "Medium";
  return "Low";
}

export function ConfidenceEngineCard({ prediction, features, matchContext, matchId }: ConfidenceEngineCardProps) {
  // Fetch vote counts for this prediction
  const { data: voteCounts } = useQuery({
    queryKey: ["confidence-votes", prediction.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prediction_votes")
        .select("vote_type")
        .eq("prediction_id", prediction.id);
      if (error) return { agree: 0, disagree: 0 };
      const agree = data.filter((v) => v.vote_type === "agree").length;
      const disagree = data.filter((v) => v.vote_type === "disagree").length;
      return { agree, disagree };
    },
  });

  // Fetch referee name from match context (already passed or from match)
  const refereeName = matchContext?.h2h_summary ? null : null; // We'll get it from match

  const statCertainty = computeStatCertainty(prediction);
  const dataQuality = computeDataQuality(features, matchContext, refereeName);
  const communityAlign = computeCommunityAlignment(
    getAiPick(prediction),
    voteCounts ?? { agree: 0, disagree: 0 }
  );
  const volatilityRaw = features?.volatility_score != null ? Number(features.volatility_score) : 0;
  const volatilityAdj = 1 - Math.min(volatilityRaw, 1);

  const pillars = {
    stat: statCertainty,
    quality: dataQuality,
    alignment: communityAlign,
    volatility: volatilityAdj,
  };

  const composite =
    pillars.stat * 0.4 +
    pillars.quality * 0.2 +
    pillars.alignment * 0.2 +
    pillars.volatility * 0.2;

  const pct = Math.round(composite * 100);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Confidence Engine 2.0
          </CardTitle>
          <Badge className={`${scoreBg(composite)} border text-xs`}>
            <span className={scoreColor(composite)}>{scoreLabel(composite)}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Composite Score */}
        <div className="flex items-center justify-center">
          <div className={`relative flex items-center justify-center h-24 w-24 rounded-full border-4 ${composite >= 0.7 ? "border-green-500" : composite >= 0.4 ? "border-yellow-500" : "border-red-500"}`}>
            <div className="text-center">
              <p className={`text-2xl font-bold ${scoreColor(composite)}`}>{pct}%</p>
              <p className="text-[10px] text-muted-foreground">Composite</p>
            </div>
          </div>
        </div>

        {/* Pillar Breakdown */}
        <div className="space-y-2">
          {PILLAR_CONFIG.map(({ key, label, weight, icon: Icon, color }) => {
            const value = pillars[key];
            const weightedValue = value * weight;
            return (
              <div key={key} className="flex items-center gap-3">
                <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground truncate">{label}</span>
                    <span className="text-xs font-semibold tabular-nums">
                      {Math.round(value * 100)}%
                      <span className="text-muted-foreground ml-1">×{weight}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${value >= 0.7 ? "bg-green-500" : value >= 0.4 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${Math.round(value * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Blends statistical gap, data completeness, crowd wisdom & match volatility
        </p>
      </CardContent>
    </Card>
  );
}
