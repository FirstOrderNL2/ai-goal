import { Button } from "@/components/ui/button";

const leagues = [
  { value: "all", label: "All Leagues" },
  { value: "Premier League", label: "Premier League" },
  { value: "La Liga", label: "La Liga" },
  { value: "Serie A", label: "Serie A" },
  { value: "Bundesliga", label: "Bundesliga" },
  { value: "Ligue 1", label: "Ligue 1" },
  { value: "WC Qualifiers Europe", label: "WC Qual. EUR" },
  { value: "WC Qualifiers South America", label: "WC Qual. SA" },
  { value: "Friendlies", label: "Friendlies" },
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
