import { useState } from "react";
import { Header } from "@/components/Header";
import { useStandings } from "@/hooks/useSportradar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Trophy } from "lucide-react";

const LEAGUE_SEASONS: Record<string, { label: string; seasonId: string }> = {
  premier_league: { label: "Premier League", seasonId: "sr:season:118689" },
  la_liga: { label: "La Liga", seasonId: "sr:season:118691" },
  serie_a: { label: "Serie A", seasonId: "sr:season:118699" },
};

interface StandingRow {
  rank: number;
  competitor: {
    id: string;
    name: string;
  };
  played: number;
  win: number;
  draw: number;
  loss: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
}

export default function Standings() {
  const [league, setLeague] = useState("premier_league");
  const config = LEAGUE_SEASONS[league];
  const { data, isLoading, error } = useStandings(config.seasonId);

  // Sportradar standings structure: data.standings[0].groups[0].team_standings
  const standings: StandingRow[] = (() => {
    if (!data?.standings) return [];
    const firstStanding = data.standings[0];
    if (!firstStanding) return [];
    // Could be groups or direct team_standings
    if (firstStanding.groups) {
      return firstStanding.groups[0]?.team_standings ?? [];
    }
    if (firstStanding.team_standings) {
      return firstStanding.team_standings;
    }
    return [];
  })();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Standings</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.entries(LEAGUE_SEASONS).map(([key, val]) => (
            <Button
              key={key}
              variant={league === key ? "default" : "secondary"}
              size="sm"
              onClick={() => setLeague(key)}
              className="text-xs"
            >
              {val.label}
            </Button>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <p className="text-destructive text-sm">
            Failed to load standings. The Sportradar trial API may be rate-limited.
          </p>
        )}

        {!isLoading && standings.length > 0 && (
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-center w-12">P</TableHead>
                  <TableHead className="text-center w-12">W</TableHead>
                  <TableHead className="text-center w-12">D</TableHead>
                  <TableHead className="text-center w-12">L</TableHead>
                  <TableHead className="text-center w-14">GF</TableHead>
                  <TableHead className="text-center w-14">GA</TableHead>
                  <TableHead className="text-center w-14">GD</TableHead>
                  <TableHead className="text-center w-14 font-bold">Pts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standings.map((row) => (
                  <TableRow key={row.competitor?.id ?? row.rank}>
                    <TableCell className="font-medium text-muted-foreground">
                      {row.rank}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-sm">
                        {row.competitor?.name ?? "Unknown"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{row.played}</TableCell>
                    <TableCell className="text-center">{row.win}</TableCell>
                    <TableCell className="text-center">{row.draw}</TableCell>
                    <TableCell className="text-center">{row.loss}</TableCell>
                    <TableCell className="text-center">{row.goals_for}</TableCell>
                    <TableCell className="text-center">{row.goals_against}</TableCell>
                    <TableCell className="text-center font-medium">
                      {row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}
                    </TableCell>
                    <TableCell className="text-center font-bold text-primary">
                      {row.points}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && !error && standings.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-10">
            No standings data available for this season.
          </p>
        )}
      </main>
    </div>
  );
}
