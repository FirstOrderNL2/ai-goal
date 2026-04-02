import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Swords } from "lucide-react";
import { format } from "date-fns";

interface H2HResult {
  date: string;
  home: string;
  away: string;
  score_home: number;
  score_away: number;
}

interface Props {
  results: H2HResult[];
  homeTeamName: string;
  awayTeamName: string;
}

export function H2HCard({ results, homeTeamName, awayTeamName }: Props) {
  if (!results || results.length === 0) return null;

  // Compute summary
  let homeWins = 0, awayWins = 0, draws = 0, totalGoals = 0;
  for (const r of results) {
    const h = r.score_home ?? 0;
    const a = r.score_away ?? 0;
    totalGoals += h + a;
    // Determine who won relative to homeTeamName
    const isHomeTeamHome = r.home?.toLowerCase().includes(homeTeamName.toLowerCase().split(" ")[0]);
    const gf = isHomeTeamHome ? h : a;
    const ga = isHomeTeamHome ? a : h;
    if (gf > ga) homeWins++;
    else if (ga > gf) awayWins++;
    else draws++;
  }
  const avgGoals = (totalGoals / results.length).toFixed(1);

  const leader = homeWins > awayWins ? homeTeamName : awayWins > homeWins ? awayTeamName : null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Swords className="h-4 w-4 text-primary" />
          Head to Head ({results.length} matches)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary */}
        <div className="rounded-lg bg-muted p-3 text-center space-y-1">
          <p className="text-sm font-semibold">
            {leader
              ? `${leader} leads ${Math.max(homeWins, awayWins)}-${Math.min(homeWins, awayWins)}${draws > 0 ? ` (${draws} draw${draws > 1 ? "s" : ""})` : ""}`
              : `Even: ${homeWins}-${awayWins}${draws > 0 ? ` (${draws} draw${draws > 1 ? "s" : ""})` : ""}`
            }
          </p>
          <p className="text-xs text-muted-foreground">Avg {avgGoals} goals per match</p>
        </div>

        {/* Results */}
        <div className="space-y-1.5">
          {results.slice(0, 6).map((r, i) => (
            <div key={i} className="flex items-center justify-between text-sm rounded-lg bg-muted/50 p-2">
              <span className="text-xs text-muted-foreground w-20 shrink-0">
                {r.date ? format(new Date(r.date), "MMM d, yyyy") : ""}
              </span>
              <span className="font-medium truncate flex-1 text-right">{r.home}</span>
              <span className="font-bold tabular-nums px-3">{r.score_home} - {r.score_away}</span>
              <span className="font-medium truncate flex-1">{r.away}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
