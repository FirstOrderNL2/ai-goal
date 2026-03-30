import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb } from "lucide-react";
import { useFunFacts } from "@/hooks/useSportradar";
import { Skeleton } from "@/components/ui/skeleton";

interface FunFactsCardProps {
  sportradarEventId: string | null | undefined;
}

export function FunFactsCard({ sportradarEventId }: FunFactsCardProps) {
  const { data, isLoading } = useFunFacts(sportradarEventId);

  if (!sportradarEventId) return null;
  if (isLoading) return <Skeleton className="h-32" />;

  const facts = data?.fun_facts || data?.generated_fun_facts;
  if (!facts || !Array.isArray(facts) || facts.length === 0) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4 text-primary" />
          Fun Facts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {facts.slice(0, 5).map((fact: any, i: number) => (
          <div key={i} className="text-sm rounded-lg bg-muted p-2.5">
            {typeof fact === "string" ? fact : fact.text || fact.statement || JSON.stringify(fact)}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
