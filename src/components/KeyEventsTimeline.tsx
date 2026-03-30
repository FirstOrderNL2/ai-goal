import type { SBEvent } from "@/lib/statsbomb";
import { Badge } from "@/components/ui/badge";

interface KeyEventsTimelineProps {
  events: SBEvent[];
}

export function KeyEventsTimeline({ events }: KeyEventsTimelineProps) {
  const keyEvents = events.filter((e) => {
    const t = e.type.name;
    return (
      t === "Goal" ||
      (t === "Shot" && e.shot?.outcome?.name === "Goal") ||
      t === "Substitution" ||
      (t === "Foul Committed" && e.foul_committed?.card)
    );
  });

  if (keyEvents.length === 0) return null;

  const getLabel = (e: SBEvent) => {
    if (e.type.name === "Shot" && e.shot?.outcome?.name === "Goal") return "⚽ Goal";
    if (e.type.name === "Goal") return "⚽ Goal";
    if (e.type.name === "Substitution") return "🔄 Sub";
    if (e.foul_committed?.card?.name?.includes("Yellow")) return "🟨 Yellow";
    if (e.foul_committed?.card?.name?.includes("Red")) return "🟥 Red";
    return e.type.name;
  };

  const getVariant = (e: SBEvent): "default" | "secondary" | "destructive" | "outline" => {
    if (e.shot?.outcome?.name === "Goal" || e.type.name === "Goal") return "default";
    if (e.foul_committed?.card?.name?.includes("Red")) return "destructive";
    return "secondary";
  };

  return (
    <div className="space-y-2">
      {keyEvents.map((e) => (
        <div key={e.id} className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground tabular-nums w-10 shrink-0">{e.minute}'</span>
          <Badge variant={getVariant(e)} className="shrink-0">{getLabel(e)}</Badge>
          <span className="truncate">
            {e.player?.name ?? "Unknown"}{" "}
            <span className="text-muted-foreground">({e.team.name})</span>
            {e.substitution && (
              <span className="text-muted-foreground"> → {e.substitution.replacement.name}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
