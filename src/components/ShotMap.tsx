import type { SBEvent } from "@/lib/statsbomb";

interface ShotMapProps {
  events: SBEvent[];
  homeTeam: string;
  awayTeam: string;
}

export function ShotMap({ events, homeTeam, awayTeam }: ShotMapProps) {
  const shots = events.filter((e) => e.type.name === "Shot" && e.location);

  if (shots.length === 0) return null;

  // StatsBomb pitch is 120x80
  const pitchW = 400;
  const pitchH = (80 / 120) * pitchW;
  const scale = pitchW / 120;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{homeTeam}</span>
        <span>{awayTeam}</span>
      </div>
      <svg viewBox={`0 0 ${pitchW} ${pitchH}`} className="w-full rounded-lg bg-emerald-900/20 border border-border/50">
        {/* Pitch markings */}
        <rect x={0} y={0} width={pitchW} height={pitchH} fill="none" stroke="hsl(var(--border))" strokeWidth={1} />
        <line x1={pitchW / 2} y1={0} x2={pitchW / 2} y2={pitchH} stroke="hsl(var(--border))" strokeWidth={0.5} />
        <circle cx={pitchW / 2} cy={pitchH / 2} r={30} fill="none" stroke="hsl(var(--border))" strokeWidth={0.5} />
        {/* Penalty areas */}
        <rect x={0} y={(pitchH - 44 * scale) / 2} width={18 * scale} height={44 * scale} fill="none" stroke="hsl(var(--border))" strokeWidth={0.5} />
        <rect x={pitchW - 18 * scale} y={(pitchH - 44 * scale) / 2} width={18 * scale} height={44 * scale} fill="none" stroke="hsl(var(--border))" strokeWidth={0.5} />

        {/* Shots */}
        {shots.map((shot) => {
          const x = shot.location![0] * scale;
          const y = shot.location![1] * scale;
          const xg = shot.shot?.statsbomb_xg ?? 0;
          const isGoal = shot.shot?.outcome?.name === "Goal";
          const r = Math.max(3, xg * 15);

          return (
            <circle
              key={shot.id}
              cx={x}
              cy={y}
              r={r}
              fill={isGoal ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
              fillOpacity={isGoal ? 0.9 : 0.4}
              stroke={isGoal ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
              strokeWidth={0.5}
            >
              <title>
                {shot.player?.name} — xG: {xg.toFixed(2)} {isGoal ? "⚽ GOAL" : `(${shot.shot?.outcome?.name})`}
              </title>
            </circle>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 text-xs text-muted-foreground justify-center">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-primary" /> Goal
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-muted-foreground/40" /> No Goal
        </span>
        <span>Size = xG value</span>
      </div>
    </div>
  );
}
