import { Header } from "@/components/Header";
import { useTeams } from "@/hooks/useMatches";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

export default function Teams() {
  const { data: teams, isLoading } = useTeams();

  const grouped = teams?.reduce(
    (acc, t) => {
      if (!acc[t.league]) acc[t.league] = [];
      acc[t.league].push(t);
      return acc;
    },
    {} as Record<string, typeof teams>,
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-primary">Teams</span> Directory
          </h1>
          <p className="text-sm text-muted-foreground">All teams tracked by FootballAI.</p>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : grouped ? (
          Object.entries(grouped).map(([league, leagueTeams]) => (
            <section key={league} className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                {league}
                <span className="text-xs text-muted-foreground">({leagueTeams!.length})</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {leagueTeams!.map((team) => (
                  <Card key={team.id} className="border-border/50">
                    <CardContent className="flex items-center gap-3 p-4">
                      {team.logo_url ? (
                        <img src={team.logo_url} alt={team.name} className="h-10 w-10 object-contain" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
                          {team.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{team.name}</p>
                        <p className="text-xs text-muted-foreground">{team.country}</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{league}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))
        ) : null}
      </main>
    </div>
  );
}
