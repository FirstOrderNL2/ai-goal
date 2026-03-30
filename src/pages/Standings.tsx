import { useState } from "react";
import { Header } from "@/components/Header";
import { useSportMonksStandings } from "@/hooks/useSportMonks";
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

// SportMonks season IDs — these should be updated each season or fetched dynamically
const LEAGUE_SEASONS: Record<string, { label: string; seasonId: number }> = {
  premier_league: { label: "Premier League", seasonId: 23614 },
  la_liga: { label: "La Liga", seasonId: 23686 },
  serie_a: { label: "Serie A", seasonId: 23698 },
};

interface StandingDetail {
  type_id: number;
  value: number;
}

interface StandingRow {
  position: number;
  points: number;
  participant: {
    id: number;
    name: string;
    image_path?: string;
  };
  details: StandingDetail[];
}

function getDetail(details: StandingDetail[], typeId: number): number {
  return details.find((d) => d.type_id === typeId)?.value ?? 0;
}

// SportMonks detail type IDs
const TYPE_WINS = 130;
const TYPE_DRAWS = 131;
const TYPE_LOSSES = 132;
const TYPE_GF = 133;
const TYPE_GA = 134;

export default function Standings() {
  const [league, setLeague] = useState("premier_league");
  const config = LEAGUE_SEASONS[league];
  const { data, isLoading, error } = useSportMonksStandings(config.seasonId);

  // SportMonks returns standings data nested
  const standings: StandingRow[] = (() => {
    if (!data?.data) return [];
    // data.data is array of standing groups; take first group's standings
    const groups = data.data;
    if (Array.isArray(groups) && groups.length > 0) {
      // Each group has a `standings` or `details` array, or the rows are directly in it
      const first = groups[0];
      if (first.standings) return first.standings;
      if (first.details) return first.details;
      // Some structures return rows directly
      if (first.position !== undefined) return groups;
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
            Failed to load standings. Check your SportMonks API key.
          </p>
        )}

        {!isLoading && standings.length > 0 && (
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Team</TableHead>
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
                {standings.map((row) => {
                  const w = getDetail(row.details ?? [], TYPE_WINS);
                  const d = getDetail(row.details ?? [], TYPE_DRAWS);
                  const l = getDetail(row.details ?? [], TYPE_LOSSES);
                  const gf = getDetail(row.details ?? [], TYPE_GF);
                  const ga = getDetail(row.details ?? [], TYPE_GA);
                  const gd = gf - ga;

                  return (
                    <TableRow key={row.participant?.id ?? row.position}>
                      <TableCell className="font-medium text-muted-foreground">
                        {row.position}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {row.participant?.image_path && (
                            <img
                              src={row.participant.image_path}
                              alt={row.participant.name}
                              className="h-5 w-5 object-contain"
                            />
                          )}
                          <span className="font-medium text-sm">
                            {row.participant?.name ?? "Unknown"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{w}</TableCell>
                      <TableCell className="text-center">{d}</TableCell>
                      <TableCell className="text-center">{l}</TableCell>
                      <TableCell className="text-center">{gf}</TableCell>
                      <TableCell className="text-center">{ga}</TableCell>
                      <TableCell className="text-center font-medium">
                        {gd > 0 ? `+${gd}` : gd}
                      </TableCell>
                      <TableCell className="text-center font-bold text-primary">
                        {row.points}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
