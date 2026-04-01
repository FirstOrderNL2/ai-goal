import { Button } from "@/components/ui/button";

const leagues = [
  { value: "all", label: "All Leagues" },
  { value: "Champions League", label: "UCL" },
  { value: "Europa League", label: "UEL" },
  { value: "Premier League", label: "Premier League" },
  { value: "La Liga", label: "La Liga" },
  { value: "Serie A", label: "Serie A" },
  { value: "Bundesliga", label: "Bundesliga" },
  { value: "Ligue 1", label: "Ligue 1" },
  { value: "Eredivisie", label: "Eredivisie" },
  { value: "WC Qualifiers Europe", label: "WCQ Europe" },
  { value: "WC Qualifiers CONMEBOL", label: "WCQ CONMEBOL" },
  { value: "WC Qualifiers CONCACAF", label: "WCQ CONCACAF" },
  { value: "World Cup 2026", label: "World Cup" },
  { value: "Women's Champions League", label: "UWCL" },
];

interface LeagueFilterProps {
  selected: string;
  onChange: (league: string) => void;
}

export function LeagueFilter({ selected, onChange }: LeagueFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {leagues.map((l) => (
        <Button
          key={l.value}
          variant={selected === l.value ? "default" : "secondary"}
          size="sm"
          onClick={() => onChange(l.value)}
          className="text-xs"
        >
          {l.label}
        </Button>
      ))}
    </div>
  );
}
