import { useRef, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, Circle } from "lucide-react";
import { useLiveFixture, useFixtureEvents, type MatchEvent } from "@/hooks/useFixtureData";

interface LiveMatchCardProps {
  apiFootballId: number | null | undefined;
  matchStatus?: string;
  homeTeamName?: string;
  awayTeamName?: string;
}

function EventIcon({ type, detail }: { type: string; detail: string }) {
  if (type === "Goal") return <span className="text-xs">⚽</span>;
  if (type === "Card" && detail === "Yellow Card") return <span className="inline-block w-2.5 h-3.5 bg-yellow-400 rounded-sm" />;
  if (type === "Card" && detail?.includes("Red")) return <span className="inline-block w-2.5 h-3.5 bg-red-500 rounded-sm" />;
  if (type === "subst") return <span className="text-xs">🔄</span>;
  return <Circle className="h-2 w-2 text-muted-foreground" />;
}

function EventRow({ event }: { event: MatchEvent }) {
  const time = event.time?.elapsed ?? 0;
  const extra = event.time?.extra ? `+${event.time.extra}` : "";
  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      <span className="w-10 text-right font-mono text-muted-foreground shrink-0">{time}{extra}'</span>
      <EventIcon type={event.type} detail={event.detail} />
      <span className="flex-1">
        <span className="font-medium">{event.player?.name}</span>
        {event.assist?.name && (
          <span className="text-muted-foreground"> (assist: {event.assist.name})</span>
        )}
        {event.type === "subst" && event.assist?.name && (
          <span className="text-muted-foreground"> ↔ {event.assist.name}</span>
        )}
      </span>
      <span className="text-[10px] text-muted-foreground shrink-0">{event.team?.name}</span>
    </div>
  );
}

export function LiveMatchCard({ apiFootballId, matchStatus, homeTeamName, awayTeamName }: LiveMatchCardProps) {
  const { data: fixture, isLoading: fixtureLoading } = useLiveFixture(apiFootballId, matchStatus);
  const { data: events = [], isLoading: eventsLoading } = useFixtureEvents(apiFootballId, matchStatus);

  const isLive = matchStatus === "live" || matchStatus === "1H" || matchStatus === "2H" || matchStatus === "HT";
  const isCompleted = matchStatus === "completed" || matchStatus === "FT";

  // Flash animation on goal change
  const [flash, setFlash] = useState(false);
  const prevScoreRef = useRef<string | null>(null);
  const currentScore = fixture ? `${fixture.goals?.home ?? 0}-${fixture.goals?.away ?? 0}` : null;

  useEffect(() => {
    if (currentScore && prevScoreRef.current !== null && prevScoreRef.current !== currentScore) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1500);
      return () => clearTimeout(t);
    }
    if (currentScore) prevScoreRef.current = currentScore;
  }, [currentScore]);

  if (!isLive && !isCompleted) return null;
  if (fixtureLoading || eventsLoading) return <Skeleton className="h-24" />;
  if (!fixture && events.length === 0) return null;

  const status = fixture?.fixture?.status;
  const elapsed = status?.elapsed ?? 0;
  const statusShort = status?.short ?? matchStatus;

  const significantEvents = events.filter((e: MatchEvent) =>
    e.type === "Goal" || e.type === "Card" || e.type === "subst"
  );

  return (
    <Card className={`border-border/50 transition-all duration-500 ${isLive ? "ring-1 ring-green-500/30" : ""} ${flash ? "ring-2 ring-green-400 bg-green-500/5" : ""}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className={`h-4 w-4 ${isLive ? "text-green-500" : "text-primary"}`} />
          {isLive ? "Live Match" : "Match Events"}
          {isLive && (
            <Badge className="bg-green-500/20 text-green-500 text-[10px] animate-pulse">
              {statusShort} {elapsed}'
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLive && fixture && (
          <div className={`flex items-center justify-center gap-4 py-2 transition-all duration-500 ${flash ? "scale-110" : ""}`}>
            <span className="text-sm font-bold">{homeTeamName}</span>
            <span className="text-2xl font-bold tabular-nums px-3 py-1 rounded-lg bg-muted">
              {fixture.goals?.home ?? 0} - {fixture.goals?.away ?? 0}
            </span>
            <span className="text-sm font-bold">{awayTeamName}</span>
          </div>
        )}

        {significantEvents.length > 0 && (
          <div className="divide-y divide-border/30 max-h-60 overflow-y-auto">
            {significantEvents.map((event: MatchEvent, i: number) => (
              <EventRow key={i} event={event} />
            ))}
          </div>
        )}

        {significantEvents.length === 0 && isLive && (
          <p className="text-xs text-muted-foreground text-center py-2">No significant events yet</p>
        )}
      </CardContent>
    </Card>
  );
}
