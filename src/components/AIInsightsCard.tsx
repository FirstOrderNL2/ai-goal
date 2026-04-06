import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Sparkles, ClipboardCheck, ExternalLink, Zap } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface AIInsightsCardProps {
  matchId: string;
  existingInsights: string | null;
  matchStatus?: string;
  postMatchReview?: string | null;
  accuracyScore?: number | null;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? "bg-green-500/20 text-green-400 border-green-500/30"
      : score >= 40
      ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      : "bg-red-500/20 text-red-400 border-red-500/30";

  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border", color)}>
      {score}/100
    </span>
  );
}

function parseInsightsSections(text: string) {
  const liveSourcesMatch = text.match(/📡 LIVE DATA SOURCES:\n([\s\S]*?)(?=\n\n|$)/);
  const keyFactorsMatch = text.match(/🎯 KEY FACTORS:\n([\s\S]*?)(?=\n\n|$)/);

  const liveSources = liveSourcesMatch
    ? liveSourcesMatch[1].split("\n").map(s => s.replace(/^[•\-]\s*/, "").trim()).filter(Boolean)
    : [];

  const keyFactors = keyFactorsMatch
    ? keyFactorsMatch[1].split("\n").map(s => s.replace(/^[•\-]\s*/, "").trim()).filter(Boolean)
    : [];

  // Remove the parsed sections from the main text for cleaner display
  let cleanText = text
    .replace(/\n\n📡 LIVE DATA SOURCES:\n[\s\S]*?(?=\n\n|$)/, "")
    .replace(/\n\n🎯 KEY FACTORS:\n[\s\S]*?(?=\n\n|$)/, "")
    .trim();

  return { cleanText, liveSources, keyFactors };
}

export function AIInsightsCard({
  matchId,
  existingInsights,
  matchStatus,
  postMatchReview,
  accuracyScore,
}: AIInsightsCardProps) {
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

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-post-match-review", {
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

  const insights = existingInsights || generateMutation.data?.insights;
  const review = postMatchReview || reviewMutation.data?.review;
  const score = accuracyScore ?? reviewMutation.data?.accuracy_score ?? null;
  const isCompleted = matchStatus === "completed";

  const parsed = insights ? parseInsightsSections(insights) : null;

  return (
    <Card className="border-border/50">
      {/* Pre-match prediction section */}
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4 text-primary" />
          AI Match Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!insights && !generateMutation.data ? (
          <div className="text-center space-y-3">
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
          </div>
        ) : (
          <>
            <div className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
              {parsed?.cleanText || insights}
            </div>

            {/* Key Factors badges */}
            {parsed && parsed.keyFactors.length > 0 && (
              <div className="space-y-2">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Zap className="h-3 w-3 text-primary" />
                  Key Factors
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {parsed.keyFactors.map((factor, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-primary/10 text-primary border border-primary/20"
                    >
                      {factor}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Live Data Sources */}
            {parsed && parsed.liveSources.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <ExternalLink className="h-3 w-3" />
                  Sources Referenced
                </h4>
                <div className="flex flex-wrap gap-1">
                  {parsed.liveSources.map((source, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"
                    >
                      {source}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={() => generateMutation.mutate()}
              variant="ghost"
              size="sm"
              className="text-xs"
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Regenerate
            </Button>
          </>
        )}

        {/* Post-match review section */}
        {isCompleted && (
          <div className="border-t border-border/50 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                Post-Match Review
              </h4>
              {score !== null && <ScoreBadge score={score} />}
            </div>

            {reviewMutation.isPending ? (
              <Skeleton className="h-24" />
            ) : review ? (
              <>
                <div className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                  {review}
                </div>
                <Button
                  onClick={() => reviewMutation.mutate()}
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Re-analyze
                </Button>
              </>
            ) : (
              <div className="text-center space-y-2">
                <p className="text-xs text-muted-foreground">
                  See how the AI prediction performed against the actual result
                </p>
                <Button
                  onClick={() => reviewMutation.mutate()}
                  variant="outline"
                  size="sm"
                  disabled={reviewMutation.isPending}
                >
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Generate Post-Match Review
                </Button>
                {reviewMutation.isError && (
                  <p className="text-xs text-destructive">
                    {(reviewMutation.error as Error).message}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
