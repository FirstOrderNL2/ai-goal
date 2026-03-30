interface ProbabilityBarProps {
  homeWin: number;
  draw: number;
  awayWin: number;
}

export function ProbabilityBar({ homeWin, draw, awayWin }: ProbabilityBarProps) {
  const hPct = Math.round(homeWin * 100);
  const dPct = Math.round(draw * 100);
  const aPct = 100 - hPct - dPct;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-medium">
        <span className="text-win">{hPct}%</span>
        <span className="text-draw">{dPct}%</span>
        <span className="text-loss">{aPct}%</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div className="bg-win transition-all" style={{ width: `${hPct}%` }} />
        <div className="bg-draw transition-all" style={{ width: `${dPct}%` }} />
        <div className="bg-loss transition-all" style={{ width: `${aPct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Home</span>
        <span>Draw</span>
        <span>Away</span>
      </div>
    </div>
  );
}
