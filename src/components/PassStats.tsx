import type { SBEvent } from "@/lib/statsbomb";

interface PassStatsProps {
  events: SBEvent[];
  homeTeam: string;
  awayTeam: string;
}

export function PassStats({ events, homeTeam, awayTeam }: PassStatsProps) {
  const passes = events.filter((e) => e.type.name === "Pass");

  const calc = (teamName: string) => {
    const teamPasses = passes.filter((p) => p.team.name === teamName);
    const completed = teamPasses.filter((p) => !p.pass?.outcome);
    const keyPasses = teamPasses.filter((p) => p.pass?.recipient && p.pass?.end_location);
    return {
      total: teamPasses.length,
      completed: completed.length,
      pct: teamPasses.length > 0 ? Math.round((completed.length / teamPasses.length) * 100) : 0,
      key: keyPasses.length,
    };
  };

  const home = calc(homeTeam);
  const away = calc(awayTeam);

  if (home.total === 0 && away.total === 0) return null;

  const rows = [
    { label: "Total Passes", home: home.total, away: away.total },
    { label: "Completed", home: home.completed, away: away.completed },
    { label: "Accuracy", home: `${home.pct}%`, away: `${away.pct}%` },
  ];

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-3 gap-2 text-sm items-center">
          <span className="text-right font-medium">{r.home}</span>
          <span className="text-center text-muted-foreground text-xs">{r.label}</span>
          <span className="font-medium">{r.away}</span>
        </div>
      ))}
    </div>
  );
}
