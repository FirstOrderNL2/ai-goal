import { useState } from "react";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
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

const LEAGUE_OPTIONS = [
  { key: "Premier League", label: "Premier League" },
  { key: "La Liga", label: "La Liga" },
  { key: "Serie A", label: "Serie A" },
  { key: "Bundesliga", label: "Bundesliga" },
  { key: "Ligue 1", label: "Ligue 1" },
];

interface StandingEntry {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  form: string | null;
}

export default function Standings() {
  const [league, setLeague] = useState("Premier League");

  // Fetch standings from leagues table
  const { data: leagueData, isLoading, error } = useQuery({
    queryKey: ["standings", league],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("standings_data, logo_url, updated_at")
        .eq("name", league)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch teams for logo fallback
  const { data: teams } = useQuery({
    queryKey: ["teams-all"],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("name, logo_url, api_football_id");
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const teamLogoMap = new Map<number, string>();
  teams?.forEach((t) => {
    if (t.logo_url && t.api_football_id) {
      teamLogoMap.set(t.api_football_id, t.logo_url);
    }
  });

  // Parse standings from the JSONB data
  const standings: StandingEntry[] = (() => {
    const sd = leagueData?.standings_data as any;
    if (!sd || !Array.isArray(sd)) return [];
    // standings_data is array of groups (each group is array of team standings)
    const firstGroup = sd[0];
    if (!Array.isArray(firstGroup)) return [];
    return firstGroup;
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
          {LEAGUE_OPTIONS.map((opt) => (
            <Button
              key={opt.key}
              variant={league === opt.key ? "default" : "secondary"}
              size="sm"
              onClick={() => setLeague(opt.key)}
              className="text-xs"
            >
              {opt.label}
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
            No standings data available yet. Run a sync to populate standings.
          </p>
        )}

        {leagueData?.updated_at && (
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(leagueData.updated_at).toLocaleString("en-GB", { timeZone: "Europe/Berlin" })}
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
                  <TableHead className="text-center w-20">Form</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standings.map((row) => {
                  const logo = row.team?.logo || teamLogoMap.get(row.team?.id);
                  return (
                    <TableRow key={row.team?.id ?? row.rank}>
                      <TableCell className="font-medium text-muted-foreground">
                        {row.rank}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {logo && (
                            <img src={logo} alt="" className="h-5 w-5 object-contain" />
                          )}
                          <span className="font-medium text-sm">
                            {row.team?.name ?? "Unknown"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{row.all?.played}</TableCell>
                      <TableCell className="text-center">{row.all?.win}</TableCell>
                      <TableCell className="text-center">{row.all?.draw}</TableCell>
                      <TableCell className="text-center">{row.all?.lose}</TableCell>
                      <TableCell className="text-center">{row.all?.goals?.for}</TableCell>
                      <TableCell className="text-center">{row.all?.goals?.against}</TableCell>
                      <TableCell className="text-center font-medium">
                        {row.goalsDiff > 0 ? `+${row.goalsDiff}` : row.goalsDiff}
                      </TableCell>
                      <TableCell className="text-center font-bold text-primary">
                        {row.points}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.form && (
                          <div className="flex gap-0.5 justify-center">
                            {row.form.split("").slice(-5).map((c, i) => (
                              <span
                                key={i}
                                className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                                  c === "W" ? "bg-green-500/20 text-green-500" :
                                  c === "D" ? "bg-yellow-500/20 text-yellow-500" :
                                  "bg-red-500/20 text-red-500"
                                }`}
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
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
            No standings data available for this league yet.
          </p>
        )}
      </main>
    </div>
  );
}
