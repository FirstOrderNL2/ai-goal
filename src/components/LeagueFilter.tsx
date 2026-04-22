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
  { value: "2. Bundesliga", label: "2. Bundesliga" },
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
  { value: "Primeira Liga", label: "Primeira" },
  { value: "Jupiler Pro League", label: "Pro League" },
  { value: "Süper Lig", label: "Süper Lig" },
  { value: "Premiership", label: "Premiership" },
  { value: "Super League", label: "Super League CH" },
  { value: "Bundesliga Austria", label: "Bundesliga AT" },
  { value: "Super League 1", label: "Super League GR" },
  { value: "Superliga", label: "Superliga" },
  { value: "Allsvenskan", label: "Allsvenskan" },
  { value: "Eliteserien", label: "Eliteserien" },
  { value: "Ekstraklasa", label: "Ekstraklasa" },
  { value: "Chance Liga", label: "Chance Liga" },
  { value: "HNL", label: "HNL" },
  { value: "Premier League Ukraine", label: "Ukraine PL" },
];

interface LeagueFilterProps {
  selected: string;
  onChange: (league: string) => void;
}

export function LeagueFilter({ selected, onChange }: LeagueFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      {leagues.map((l) => (
        <Button
          key={l.value}
          variant={selected === l.value ? "default" : "secondary"}
          size="sm"
          onClick={() => onChange(l.value)}
          className="text-xs shrink-0"
        >
          {l.label}
        </Button>
      ))}
    </div>
  );
}
