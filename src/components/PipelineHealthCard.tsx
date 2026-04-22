import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Activity, AlertTriangle, Brain, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Status = "success" | "partial" | "failed" | "pending";

function useMLReadiness() {
  return useQuery({
    queryKey: ["ml-readiness"],
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ml_readiness_v")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as {
        labeled_samples: number;
        feature_snapshots: number;
        label_coverage: number;
        ml_status: "collecting" | "ready";
        samples_to_target: number;
      } | null;
    },
  });
}

function usePipelineHealth() {
  return useQuery({
    queryKey: ["pipeline-health"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const in60m = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      const [{ data: upcoming }, { data: imminent }, { data: logs }] = await Promise.all([
        supabase
          .from("matches")
          .select("id, predictions(generation_status)")
          .eq("status", "upcoming")
          .gte("match_date", now.toISOString())
          .lte("match_date", in24h)
          .limit(500),
        supabase
          .from("matches")
          .select("id, match_date, predictions(last_prediction_at)")
          .eq("status", "upcoming")
          .gte("match_date", now.toISOString())
          .lte("match_date", in60m)
          .limit(50),
        supabase
          .from("prediction_logs")
          .select("status, created_at")
          .gte("created_at", past24h)
          .limit(2000),
      ]);

      const total = upcoming?.length ?? 0;
      const counts: Record<Status, number> = { success: 0, partial: 0, failed: 0, pending: 0 };
      for (const m of (upcoming as any[] | null) ?? []) {
        const pred = Array.isArray(m.predictions) ? m.predictions[0] : m.predictions;
        const s = (pred?.generation_status as Status | undefined) ?? "pending";
        if (s in counts) counts[s]++;
        else counts.pending++;
      }

      // Freshness for next-60min matches
      let freshSum = 0, freshN = 0;
      for (const m of (imminent as any[] | null) ?? []) {
        const pred = Array.isArray(m.predictions) ? m.predictions[0] : m.predictions;
        if (pred?.last_prediction_at) {
          freshSum += (now.getTime() - new Date(pred.last_prediction_at).getTime()) / 60000;
          freshN++;
        }
      }
      const avgFreshness = freshN > 0 ? Math.round(freshSum / freshN) : null;

      // Failure rate (last 24h)
      const logTotal = logs?.length ?? 0;
      const logFails = (logs ?? []).filter((l: any) => l.status === "failed").length;
      const failRate = logTotal > 0 ? logFails / logTotal : 0;

      const successPct = total > 0 ? (counts.success + counts.partial) / total : 1;

      return { total, counts, avgFreshness, failRate, logTotal, successPct };
    },
  });
}

export function PipelineHealthCard() {
  const { data, isLoading } = usePipelineHealth();
  const { data: ml } = useMLReadiness();

  const successPct = data ? Math.round(data.successPct * 1000) / 10 : 0;
  const failRatePct = data ? Math.round(data.failRate * 1000) / 10 : 0;
  const healthy = successPct >= 99;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Prediction Pipeline Health
          </CardTitle>
          <Badge variant={healthy ? "default" : "destructive"}>
            {healthy ? "Healthy" : "Degraded"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Loading metrics…</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Coverage (24h)
              </div>
              <div className="text-2xl font-bold">{successPct}%</div>
              <div className="text-xs text-muted-foreground mt-1">
                {data.counts.success + data.counts.partial}/{data.total} matches
              </div>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Failure rate (24h)
              </div>
              <div className="text-2xl font-bold">{failRatePct}%</div>
              <div className="text-xs text-muted-foreground mt-1">
                across {data.logTotal} attempts
              </div>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Clock className="h-3.5 w-3.5" /> Freshness (T-60)
              </div>
              <div className="text-2xl font-bold">
                {data.avgFreshness == null ? "—" : `${data.avgFreshness}m`}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                avg minutes since refresh
              </div>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <RefreshCw className="h-3.5 w-3.5" /> Status mix
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <Badge variant="default" className="text-xs">{data.counts.success} ok</Badge>
                <Badge variant="secondary" className="text-xs">{data.counts.partial} partial</Badge>
                {data.counts.failed > 0 && (
                  <Badge variant="destructive" className="text-xs">{data.counts.failed} failed</Badge>
                )}
                {data.counts.pending > 0 && (
                  <Badge variant="outline" className="text-xs">{data.counts.pending} pending</Badge>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
