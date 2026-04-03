import { Button } from "@/components/ui/button";

const leagues = [
  { value: "all", label: "All Leagues" },
  { value: "Champions League", label: "UCL" },
  { value: "Europa League", label: "UEL" },
  { value: "Conference League", label: "UECL" },
  { value: "Premier League", label: "Premier League" },
  { value: "Championship", label: "Championship" },
  { value: "La Liga", label: "La Liga" },
  { value: "Serie A", label: "Serie A" },
  { value: "Bundesliga", label: "Bundesliga" },
  { value: "Ligue 1", label: "Ligue 1" },
  { value: "Eredivisie", label: "Eredivisie" },
  { value: "Keuken Kampioen Divisie", label: "KKD" },
  { value: "Nations League", label: "Nations League" },
  { value: "WC Qualifiers Europe", label: "WCQ Europe" },
  { value: "WC Qualifiers South America", label: "WCQ South America" },
  { value: "WC Qualifiers CONCACAF", label: "WCQ CONCACAF" },
  { value: "World Cup", label: "World Cup" },
  { value: "Euro Championship", label: "Euro" },
  { value: "Copa America", label: "Copa América" },
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
