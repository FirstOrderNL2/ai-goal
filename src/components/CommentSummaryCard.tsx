import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  predictionId: string;
}

export function CommentSummaryCard({ predictionId }: Props) {
  const qc = useQueryClient();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["comment-summary", predictionId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("summarize-comments", {
        body: { prediction_id: predictionId },
      });
      if (error) throw error;
      return data as { summary: string | null };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data?.summary) return null;

  return (
    <Card className="border-border/50 bg-gradient-to-r from-purple-500/5 to-blue-500/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-400" />
            Community Pulse
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            disabled={isFetching}
            onClick={() => qc.invalidateQueries({ queryKey: ["comment-summary", predictionId] })}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
      </CardContent>
    </Card>
  );
}
