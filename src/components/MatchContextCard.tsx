import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, Users, CloudSun, Newspaper } from "lucide-react";
import type { MatchContext } from "@/lib/types";

interface MatchContextCardProps {
  matchId: string;
  homeTeamName?: string;
  awayTeamName?: string;
}

export function MatchContextCard({ matchId, homeTeamName, awayTeamName }: MatchContextCardProps) {
  const { data: ctx, isLoading } = useQuery({
    queryKey: ["match-context", matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("match_context")
        .select("*")
        .eq("match_id", matchId)
        .single();
      if (error) return null;
      return data as unknown as MatchContext;
    },
    enabled: !!matchId,
  });

  if (isLoading) return <Skeleton className="h-32" />;
  if (!ctx) return null;

  const hasInjuries = (ctx.injuries_home?.length ?? 0) > 0 || (ctx.injuries_away?.length ?? 0) > 0;
  const hasSuspensions = (ctx.suspensions as any[])?.length > 0;
  const hasNews = (ctx.news_items as any[])?.length > 0;
  const hasWeather = !!ctx.weather;

  if (!hasInjuries && !hasSuspensions && !hasNews && !hasWeather) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-primary" />
          Match Intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Injuries */}
        {hasInjuries && (
          <div className="space-y-2">
            <p className="text-xs font-semibold flex items-center gap-1.5 text-destructive">
              <Users className="h-3.5 w-3.5" />
              Injuries & Absences
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(ctx.injuries_home?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground">{homeTeamName || "Home"}</p>
                  {(ctx.injuries_home as any[])!.map((inj: any, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px] mr-1 mb-1 text-destructive border-destructive/30">
                      {typeof inj === "string" ? inj : inj.player || inj.name || JSON.stringify(inj)}
                    </Badge>
                  ))}
                </div>
              )}
              {(ctx.injuries_away?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground">{awayTeamName || "Away"}</p>
                  {(ctx.injuries_away as any[])!.map((inj: any, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px] mr-1 mb-1 text-destructive border-destructive/30">
                      {typeof inj === "string" ? inj : inj.player || inj.name || JSON.stringify(inj)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Suspensions */}
        {hasSuspensions && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold flex items-center gap-1.5 text-yellow-500">
              <ShieldAlert className="h-3.5 w-3.5" />
              Suspensions
            </p>
            <div className="flex flex-wrap gap-1">
              {(ctx.suspensions as any[])!.map((s: any, i: number) => (
                <Badge key={i} variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/30">
                  {typeof s === "string" ? s : s.player || s.name || JSON.stringify(s)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Weather */}
        {hasWeather && (
          <div className="flex items-center gap-2">
            <CloudSun className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{ctx.weather}</p>
          </div>
        )}

        {/* News */}
        {hasNews && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
              <Newspaper className="h-3.5 w-3.5" />
              Latest News
            </p>
            <div className="space-y-1">
              {(ctx.news_items as any[])!.slice(0, 3).map((item: any, i: number) => (
                <p key={i} className="text-[11px] text-muted-foreground leading-snug">
                  • {typeof item === "string" ? item : item.title || item.headline || JSON.stringify(item)}
                </p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
