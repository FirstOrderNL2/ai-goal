import { useParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { usePlayers } from "@/hooks/useMatches";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Team, Player } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const POSITION_ORDER = ["Goalkeeper", "Defender", "Midfielder", "Attacker"];

function groupByPosition(players: Player[]) {
  const groups: Record<string, Player[]> = {};
  for (const p of players) {
    const pos = p.position || "Unknown";
    if (!groups[pos]) groups[pos] = [];
    groups[pos].push(p);
  }
  return POSITION_ORDER
    .filter((pos) => groups[pos]?.length)
    .map((pos) => ({ position: pos, players: groups[pos] }))
    .concat(
      Object.entries(groups)
        .filter(([pos]) => !POSITION_ORDER.includes(pos))
        .map(([position, players]) => ({ position, players }))
    );
}

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: team, isLoading: teamLoading } = useQuery({
    queryKey: ["team", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as Team;
    },
    enabled: !!id,
  });

  const { data: players, isLoading: playersLoading } = usePlayers(id);
  const grouped = players ? groupByPosition(players) : [];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/teams" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to Teams
          </Link>
        </Button>

        {teamLoading ? (
          <Skeleton className="h-24" />
        ) : team ? (
          <div className="flex items-center gap-4">
            {team.logo_url ? (
              <img src={team.logo_url} alt={team.name} className="h-16 w-16 object-contain" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-xl">
                {team.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
              <p className="text-sm text-muted-foreground">
                {team.country} · {team.league}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">Team not found.</p>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Squad {players ? `(${players.length})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {playersLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : grouped.length === 0 ? (
              <p className="text-sm text-muted-foreground">No player data available yet.</p>
            ) : (
              grouped.map(({ position, players: posPlayers }) => (
                <div key={position} className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    {position}s ({posPlayers.length})
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {posPlayers.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 rounded-lg border border-border/50 p-3"
                      >
                        <Avatar className="h-9 w-9">
                          {p.photo_url ? (
                            <AvatarImage src={p.photo_url} alt={p.name} />
                          ) : null}
                          <AvatarFallback className="text-xs">
                            {p.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[p.nationality, p.age ? `${p.age}y` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
