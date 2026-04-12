import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, Shield, Target, MessageSquare } from "lucide-react";

interface Props {
  matchId: string;
  homeTeamName?: string;
  awayTeamName?: string;
}

export function FootballIntelligenceCard({ matchId, homeTeamName = "Home", awayTeamName = "Away" }: Props) {
  const { data: intel } = useQuery({
    queryKey: ["match-intelligence", matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("match_intelligence")
        .select("*")
        .eq("match_id", matchId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!matchId,
  });

  if (!intel) return null;

  const playerImpacts = (intel.player_impacts as any[]) || [];
  const tactical = (intel.tactical_analysis as any) || {};
  const marketSig = (intel.market_signal as any) || {};

  const alignmentLabel: Record<string, { text: string; color: string }> = {
    strong_agree: { text: "Strong Agreement", color: "bg-green-500/20 text-green-400" },
    agree: { text: "Agreement", color: "bg-green-500/15 text-green-400" },
    slight_diverge: { text: "Slight Divergence", color: "bg-amber-500/20 text-amber-400" },
    strong_diverge: { text: "Strong Divergence", color: "bg-red-500/20 text-red-400" },
  };

  const importanceColor = (score: number) => {
    if (score >= 80) return "bg-red-500/20 text-red-400 border-red-500/30";
    if (score >= 50) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    return "bg-green-500/20 text-green-400 border-green-500/30";
  };

  const statusIcon: Record<string, string> = {
    injured: "🤕",
    suspended: "🟥",
    doubtful: "❓",
    returning: "✅",
    key_starter: "⭐",
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4 text-primary" />
          Football Intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Match Narrative */}
        {intel.match_narrative && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
            <div className="flex items-start gap-2">
              <MessageSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-sm italic text-foreground/90">{intel.match_narrative}</p>
            </div>
          </div>
        )}

        {/* Momentum Meters */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Momentum
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {[
              { team: homeTeamName, score: intel.momentum_home ?? 50 },
              { team: awayTeamName, score: intel.momentum_away ?? 50 },
            ].map(({ team, score }) => (
              <div key={team} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium truncate">{team}</span>
                  <span className="text-muted-foreground">{score}/100</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Player Impacts */}
        {playerImpacts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Player Impact
            </h4>
            <div className="flex flex-wrap gap-2">
              {playerImpacts.slice(0, 8).map((p: any, i: number) => (
                <Badge
                  key={i}
                  variant="outline"
                  className={`text-xs ${importanceColor(p.importance)}`}
                  title={p.impact_description}
                >
                  {statusIcon[p.status] || "👤"} {p.name} ({p.importance})
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Tactical Analysis */}
        {tactical.style_matchup && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Tactical Matchup
            </h4>
            <div className="rounded-lg bg-muted/50 p-3 space-y-2">
              {(tactical.formation_home || tactical.formation_away) && (
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono">{tactical.formation_home || "?"}</span>
                  <span className="text-xs text-muted-foreground">vs</span>
                  <span className="font-mono">{tactical.formation_away || "?"}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{tactical.style_matchup}</p>
              {tactical.tactical_advantage && tactical.tactical_advantage !== "neutral" && (
                <Badge variant="outline" className="text-xs">
                  Advantage: {tactical.tactical_advantage === "home" ? homeTeamName : awayTeamName} ({tactical.advantage_score}/100)
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Market Signal */}
        {marketSig.alignment && marketSig.alignment !== "unknown" && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Model vs Market:</span>
            <Badge variant="outline" className={alignmentLabel[marketSig.alignment]?.color || ""}>
              {alignmentLabel[marketSig.alignment]?.text || marketSig.alignment}
            </Badge>
          </div>
        )}

        {/* Context Summary */}
        {intel.context_summary && (
          <p className="text-xs text-muted-foreground border-t border-border/50 pt-3">
            {intel.context_summary}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
