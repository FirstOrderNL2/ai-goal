import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Sparkles } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AIInsightsCardProps {
  matchId: string;
  existingInsights: string | null;
}

export function AIInsightsCard({ matchId, existingInsights }: AIInsightsCardProps) {
  const queryClient = useQueryClient();

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-ai-prediction", {
        body: { match_id: matchId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match", matchId] });
    },
  });

  if (generateMutation.isPending) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary animate-pulse" />
            Generating AI Analysis...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    );
  }

  if (!existingInsights && !generateMutation.data) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6 text-center space-y-3">
          <Sparkles className="h-8 w-8 text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Get AI-powered match analysis</p>
          <Button
            onClick={() => generateMutation.mutate()}
            variant="outline"
            size="sm"
            disabled={generateMutation.isPending}
          >
            <Brain className="h-4 w-4 mr-2" />
            Generate AI Insights
          </Button>
          {generateMutation.isError && (
            <p className="text-xs text-destructive">
              {(generateMutation.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const insights = existingInsights || generateMutation.data?.insights;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4 text-primary" />
          AI Match Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
          {insights}
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          variant="ghost"
          size="sm"
          className="text-xs"
        >
          <Sparkles className="h-3 w-3 mr-1" />
          Regenerate
        </Button>
      </CardContent>
    </Card>
  );
}
