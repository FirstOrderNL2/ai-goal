import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";
import { useLineups, type TeamLineup } from "@/hooks/useFixtureData";

interface LineupsCardProps {
  apiFootballId: number | null | undefined;
  homeTeamName?: string;
  awayTeamName?: string;
  // Fallback from match_context DB
  dbLineupHome?: any;
  dbLineupAway?: any;
}

function LineupSection({ lineup, teamName, side }: { lineup: TeamLineup; teamName: string; side: "home" | "away" }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">{teamName}</p>
        <Badge variant="outline" className="text-xs">{lineup.formation}</Badge>
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Starting XI</p>
        {lineup.starters.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs py-0.5">
            {p.number && (
              <span className="w-5 text-center text-muted-foreground font-mono text-[10px]">{p.number}</span>
            )}
            <span className="flex-1">{p.name}</span>
            {p.pos && (
              <span className="text-[10px] text-muted-foreground px-1 py-0.5 rounded bg-muted">{p.pos}</span>
            )}
          </div>
        ))}
      </div>
      {lineup.bench.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-border/30">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bench</p>
          <div className="flex flex-wrap gap-1">
            {lineup.bench.map((p, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] font-normal">
                {p.number ? `${p.number}. ` : ""}{p.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function parseDbLineup(db: any): TeamLineup | null {
  if (!db) return null;
  const data = Array.isArray(db) ? db[0] : db;
  if (!data) return null;
  // New format with starters/bench
  if (data.starters) {
    return {
      team: data.team ?? "Unknown",
      formation: data.formation ?? "?",
      starters: data.starters ?? [],
      bench: data.bench ?? [],
    };
  }
  // Old format with players array
  if (data.players) {
    return {
      team: data.team ?? "Unknown",
      formation: data.formation ?? "?",
      starters: data.players ?? [],
      bench: [],
    };
  }
  return null;
}

export function LineupsCard({ apiFootballId, homeTeamName, awayTeamName, dbLineupHome, dbLineupAway }: LineupsCardProps) {
  const { data: lineups, isLoading } = useLineups(apiFootballId);

  const home = lineups?.home ?? parseDbLineup(dbLineupHome);
  const away = lineups?.away ?? parseDbLineup(dbLineupAway);

  if (isLoading) return <Skeleton className="h-40" />;
  if (!home && !away) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Lineups
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          {home && <LineupSection lineup={home} teamName={homeTeamName || home.team} side="home" />}
          {away && <LineupSection lineup={away} teamName={awayTeamName || away.team} side="away" />}
        </div>
      </CardContent>
    </Card>
  );
}
