import { useState } from "react";
import { useStatsBombCompetitions, useStatsBombMatches, useStatsBombEvents } from "@/hooks/useStatsBomb";
import { ShotMap } from "@/components/ShotMap";
import { KeyEventsTimeline } from "@/components/KeyEventsTimeline";
import { PassStats } from "@/components/PassStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Activity, Crosshair } from "lucide-react";
import type { SBMatch } from "@/lib/statsbomb";

interface StatsBombSectionProps {
  homeTeamName?: string;
  awayTeamName?: string;
  matchDate?: string;
}

function normalizeTeamName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findStatsBombMatch(
  matches: SBMatch[],
  home?: string,
  away?: string,
  date?: string
): SBMatch | undefined {
  if (!home || !away) return undefined;
  const h = normalizeTeamName(home);
  const a = normalizeTeamName(away);

  return matches.find((m) => {
    const mh = normalizeTeamName(m.home_team.home_team_name);
    const ma = normalizeTeamName(m.away_team.away_team_name);
    const nameMatch = (mh.includes(h) || h.includes(mh)) && (ma.includes(a) || a.includes(ma));
    if (!nameMatch) return false;
    if (date) {
      return m.match_date === date.split("T")[0];
    }
    return true;
  });
}

export function StatsBombSection({ homeTeamName, awayTeamName, matchDate }: StatsBombSectionProps) {
  const { data: competitions } = useStatsBombCompetitions();
  const [selectedSeason, setSelectedSeason] = useState<{ compId: number; seasonId: number } | null>(null);
  const [sbMatchId, setSbMatchId] = useState<number | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "searching" | "found" | "not_found">("idle");

  // Auto-search across competitions
  const { data: searchMatches } = useStatsBombMatches(
    selectedSeason?.compId,
    selectedSeason?.seasonId
  );

  // When competitions load, start searching
  if (competitions && searchStatus === "idle" && !sbMatchId) {
    // Group by unique comp+season
    const seasons = competitions.slice(0, 20); // limit search to first 20 seasons
    if (seasons.length > 0 && !selectedSeason) {
      setSelectedSeason({ compId: seasons[0].competition_id, seasonId: seasons[0].season_id });
      setSearchStatus("searching");
    }
  }

  // Check each batch of matches
  if (searchMatches && searchStatus === "searching" && !sbMatchId) {
    const found = findStatsBombMatch(searchMatches, homeTeamName, awayTeamName, matchDate);
    if (found) {
      setSbMatchId(found.match_id);
      setSearchStatus("found");
    } else if (competitions) {
      // Try next season
      const currentIdx = competitions.findIndex(
        (c) => c.competition_id === selectedSeason?.compId && c.season_id === selectedSeason?.seasonId
      );
      const next = competitions[currentIdx + 1];
      if (next && currentIdx < 19) {
        setSelectedSeason({ compId: next.competition_id, seasonId: next.season_id });
      } else {
        setSearchStatus("not_found");
      }
    }
  }

  const { data: events, isLoading: eventsLoading } = useStatsBombEvents(sbMatchId ?? undefined);

  if (searchStatus === "not_found" || searchStatus === "idle") return null;
  if (searchStatus === "searching" && !sbMatchId) {
    return <Skeleton className="h-32" />;
  }

  if (eventsLoading) return <Skeleton className="h-48" />;
  if (!events || events.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">StatsBomb Open Data</Badge>
      </div>

      {/* Shot Map */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Crosshair className="h-4 w-4 text-primary" />
            Shot Map
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ShotMap events={events} homeTeam={homeTeamName ?? ""} awayTeam={awayTeamName ?? ""} />
        </CardContent>
      </Card>

      {/* Key Events */}
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

      {/* Pass Statistics */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            Pass Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PassStats events={events} homeTeam={homeTeamName ?? ""} awayTeam={awayTeamName ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
