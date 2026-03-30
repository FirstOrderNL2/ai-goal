import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain } from "lucide-react";
import { useMatchInsights } from "@/hooks/useSportradar";
import { Skeleton } from "@/components/ui/skeleton";

interface MatchInsightsCardProps {
  sportradarEventId: string | null | undefined;
}

export function MatchInsightsCard({ sportradarEventId }: MatchInsightsCardProps) {
  const { data, isLoading } = useMatchInsights(sportradarEventId);

  if (!sportradarEventId) return null;
  if (isLoading) return <Skeleton className="h-32" />;

  const insights = data?.insights || data?.sport_event_insights;
  if (!insights) return null;

  const items = Array.isArray(insights) ? insights : [insights];
  if (items.length === 0) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4 text-primary" />
          AI Match Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.slice(0, 5).map((insight: any, i: number) => (
          <div key={i} className="text-sm rounded-lg bg-muted p-2.5">
            {typeof insight === "string"
              ? insight
              : insight.text || insight.description || insight.summary || JSON.stringify(insight)}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
