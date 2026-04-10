import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Medal, Award, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const tierConfig: Record<string, { label: string; color: string }> = {
  elite: { label: "Elite", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  high: { label: "High", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  medium: { label: "Medium", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  low: { label: "Low", color: "bg-muted text-muted-foreground border-border" },
};

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-5 w-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-300" />;
  if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
  return <span className="text-sm font-medium text-muted-foreground">{rank}</span>;
}

export default function Leaderboard() {
  const { user } = useAuth();

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data: performers } = await supabase
        .from("user_performance")
        .select("*")
        .gte("total_votes", 5)
        .order("trust_score", { ascending: false })
        .order("accuracy_score", { ascending: false });

      if (!performers?.length) return [];

      const userIds = performers.map((p) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

      return performers.map((p, i) => ({
        ...p,
        rank: i + 1,
        profile: profileMap.get(p.user_id) ?? null,
      }));
    },
    staleTime: 60_000,
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-3xl py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Leaderboard</h1>
        </div>

        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top Predictors</CardTitle>
            <p className="text-xs text-muted-foreground">Minimum 5 votes to qualify</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !leaderboard?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No data yet</p>
                <p className="text-sm">Start voting on predictions to appear here.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Predictor</TableHead>
                    <TableHead className="text-center">Tier</TableHead>
                    <TableHead className="text-center">Votes</TableHead>
                    <TableHead className="text-center">Correct</TableHead>
                    <TableHead className="text-center">Accuracy</TableHead>
                    <TableHead className="text-right">Trust</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((entry) => {
                    const isMe = user?.id === entry.user_id;
                    const tier = tierConfig[entry.tier] ?? tierConfig.low;
                    const displayName = entry.profile?.display_name || "Anonymous";
                    const initials = displayName.slice(0, 2).toUpperCase();
                    const accuracy = entry.total_votes > 0
                      ? Math.round((entry.correct_votes / entry.total_votes) * 100)
                      : 0;

                    return (
                      <TableRow
                        key={entry.id}
                        className={isMe ? "bg-primary/5 border-l-2 border-l-primary" : ""}
                      >
                        <TableCell className="text-center">
                          <RankIcon rank={entry.rank} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              {entry.profile?.avatar_url && (
                                <AvatarImage src={entry.profile.avatar_url} />
                              )}
                              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-sm">
                              {displayName}
                              {isMe && <span className="text-primary ml-1 text-xs">(you)</span>}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[10px] ${tier.color}`}>
                            {tier.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm">{entry.total_votes}</TableCell>
                        <TableCell className="text-center text-sm">{entry.correct_votes}</TableCell>
                        <TableCell className="text-center text-sm font-medium">{accuracy}%</TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          {Number(entry.trust_score).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
