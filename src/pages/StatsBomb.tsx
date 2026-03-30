import { useState, useMemo } from "react";
import { Header } from "@/components/Header";
import { useStatsBombCompetitions, useStatsBombMatches, useStatsBombEvents } from "@/hooks/useStatsBomb";
import { ShotMap } from "@/components/ShotMap";
import { KeyEventsTimeline } from "@/components/KeyEventsTimeline";
import { PassStats } from "@/components/PassStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Crosshair, Activity, BarChart3, Database } from "lucide-react";
import type { SBCompetition } from "@/lib/statsbomb";

export default function StatsBombExplorer() {
  const { data: competitions, isLoading: compLoading } = useStatsBombCompetitions();
  const [selectedComp, setSelectedComp] = useState<string>("");
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);

  const parsed = selectedComp ? JSON.parse(selectedComp) as { compId: number; seasonId: number } : null;
  const { data: matches, isLoading: matchesLoading } = useStatsBombMatches(parsed?.compId, parsed?.seasonId);
  const { data: events, isLoading: eventsLoading } = useStatsBombEvents(selectedMatchId ?? undefined);

  // Group competitions by name
  const grouped = useMemo(() => {
    if (!competitions) return [];
    const map = new Map<string, SBCompetition[]>();
    for (const c of competitions) {
      const key = `${c.competition_name} (${c.country_name})`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [competitions]);

  const selectedMatch = matches?.find((m) => m.match_id === selectedMatchId);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 space-y-6 max-w-3xl">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            StatsBomb Explorer
          </h1>
          <p className="text-sm text-muted-foreground">
            Browse free historical event data from StatsBomb Open Data.
          </p>
        </div>

        {compLoading ? (
          <Skeleton className="h-12" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select value={selectedComp} onValueChange={(v) => { setSelectedComp(v); setSelectedMatchId(null); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select competition & season" />
              </SelectTrigger>
              <SelectContent>
                {grouped.map(([group, seasons]) => (
                  seasons.map((s) => (
                    <SelectItem
                      key={`${s.competition_id}-${s.season_id}`}
                      value={JSON.stringify({ compId: s.competition_id, seasonId: s.season_id })}
                    >
                      {group} — {s.season_name}
                    </SelectItem>
                  ))
                ))}
              </SelectContent>
            </Select>

            {matches && (
              <Select
                value={selectedMatchId?.toString() ?? ""}
                onValueChange={(v) => setSelectedMatchId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a match" />
                </SelectTrigger>
                <SelectContent>
                  {matches.map((m) => (
                    <SelectItem key={m.match_id} value={m.match_id.toString()}>
                      {m.home_team.home_team_name} {m.home_score}-{m.away_score} {m.away_team.away_team_name} ({m.match_date})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {matchesLoading && <Skeleton className="h-12" />}

        {selectedMatch && (
          <Card className="border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Badge variant="secondary" className="text-xs uppercase">{selectedMatch.competition.competition_name}</Badge>
                <span className="text-sm text-muted-foreground">{selectedMatch.match_date}</span>
              </div>
              <div className="text-center py-4">
                <span className="text-xl font-bold">{selectedMatch.home_team.home_team_name}</span>
                <span className="text-2xl font-bold mx-4 tabular-nums">{selectedMatch.home_score} - {selectedMatch.away_score}</span>
                <span className="text-xl font-bold">{selectedMatch.away_team.away_team_name}</span>
              </div>
              {selectedMatch.stadium && (
                <p className="text-xs text-muted-foreground text-center">{selectedMatch.stadium.name}</p>
              )}
            </CardContent>
          </Card>
        )}

        {eventsLoading && <Skeleton className="h-48" />}

        {events && events.length > 0 && selectedMatch && (
          <div className="space-y-4">
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Crosshair className="h-4 w-4 text-primary" />
                  Shot Map
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ShotMap
                  events={events}
                  homeTeam={selectedMatch.home_team.home_team_name}
                  awayTeam={selectedMatch.away_team.away_team_name}
                />
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-primary" />
                  Key Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <KeyEventsTimeline events={events} />
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Pass Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PassStats
                  events={events}
                  homeTeam={selectedMatch.home_team.home_team_name}
                  awayTeam={selectedMatch.away_team.away_team_name}
                />
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              Data provided by StatsBomb Open Data. Free for non-commercial use.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
