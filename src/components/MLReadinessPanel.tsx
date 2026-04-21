import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Database, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { useState } from "react";

type Report = {
  total_predictions: number;
  training_only: number;
  published: number;
  low_quality: number;
  with_feature_snapshot: number;
  with_feature_snapshot_pct: number;
  odds_coverage_pct: number;
  match_features_coverage_pct: number;
  match_enrichment_coverage_pct: number;
  match_intelligence_coverage_pct: number;
  review_coverage_pct: number;
  total_reviews: number;
  usable_training_samples: number;
  orphan_rows: { predictions: number; match_features: number; prediction_reviews: number };
  missing_fields_top10: Array<{ field: string; missing_count: number }>;
  success_criteria: {
    snapshot_pct_ok: boolean;
    training_samples_ok: boolean;
    odds_coverage_ok: boolean;
    no_orphans_ok: boolean;
  };
};

function statusOf(value: number, thresholds: { ok: number; warn: number }): "ok" | "warn" | "bad" {
  if (value >= thresholds.ok) return "ok";
  if (value >= thresholds.warn) return "warn";
  return "bad";
}

function StatusDot({ s }: { s: "ok" | "warn" | "bad" }) {
  if (s === "ok") return <CheckCircle2 className="h-4 w-4 text-win" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-draw" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

function Metric({
  label, value, suffix = "", status,
}: { label: string; value: number | string; suffix?: string; status: "ok" | "warn" | "bad" }) {
  const tone =
    status === "ok" ? "border-win/30 bg-win/5"
    : status === "warn" ? "border-draw/30 bg-draw/5"
    : "border-destructive/30 bg-destructive/5";
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <StatusDot s={status} />
      </div>
      <p className="text-lg font-mono font-bold mt-1">
        {typeof value === "number" ? value.toLocaleString() : value}{suffix}
      </p>
    </div>
  );
}

export function MLReadinessPanel() {
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillLog, setBackfillLog] = useState<string>("");

  const { data: report, isLoading, refetch } = useQuery<Report>({
    queryKey: ["dataset-validation-report"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("dataset-validation-report", {
        method: "POST", body: {},
      });
      if (error) throw error;
      return data as Report;
    },
    refetchInterval: 60_000,
  });

  async function runBackfillLoop(maxBatches = 12) {
    setBackfillRunning(true);
    setBackfillLog("Starting…");
    let cursor: string | null = null;
    let totalProcessed = 0;
    let totalSucceeded = 0;
    try {
      for (let i = 0; i < maxBatches; i++) {
        const { data, error } = await supabase.functions.invoke("backfill-training-predictions", {
          method: "POST",
          body: { cursor, batch: 25, delay: 200 },
        });
        if (error) throw error;
        const r = data as { processed: number; succeeded: number; next_cursor: string | null; exhausted: boolean };
        totalProcessed += r.processed;
        totalSucceeded += r.succeeded;
        setBackfillLog(`Batch ${i + 1}: +${r.succeeded}/${r.processed} (total ${totalSucceeded}/${totalProcessed})`);
        if (r.exhausted || !r.next_cursor) break;
        cursor = r.next_cursor;
      }
      setBackfillLog(`Done. Backfilled ${totalSucceeded}/${totalProcessed} predictions.`);
      await refetch();
    } catch (e) {
      setBackfillLog(`Error: ${(e as Error).message}`);
    } finally {
      setBackfillRunning(false);
    }
  }

  async function runOddsBackfill() {
    setBackfillRunning(true);
    setBackfillLog("Backfilling odds…");
    try {
      const { data, error } = await supabase.functions.invoke("backfill-odds", {
        method: "POST", body: { scope: "upcoming", max: 60 },
      });
      if (error) throw error;
      const r = data as { inserted: number; targets: number };
      setBackfillLog(`Odds: inserted ${r.inserted}/${r.targets} fixtures.`);
      await refetch();
    } catch (e) {
      setBackfillLog(`Error: ${(e as Error).message}`);
    } finally {
      setBackfillRunning(false);
    }
  }

  async function runDeepBackfill(target: "predictions" | "odds") {
    setBackfillRunning(true);
    setBackfillLog(`Deep ${target} backfill running on the server…`);
    try {
      const { data, error } = await supabase.functions.invoke("run-backfill-loop", {
        method: "POST",
        body: target === "predictions"
          ? { target: "predictions", max_iterations: 80, batch: 25, stop_at: 2000 }
          : { target: "odds", max_iterations: 40, batch: 30, scope: "completed" },
      });
      if (error) throw error;
      const r = data as any;
      setBackfillLog(`Deep ${target}: ${r.iterations} iterations, +${r.total_succeeded} succeeded, ${r.total_failed} failed${r.exhausted ? " (exhausted)" : ""}.`);
      await refetch();
    } catch (e) {
      setBackfillLog(`Error: ${(e as Error).message}`);
    } finally {
      setBackfillRunning(false);
    }
  }

  async function populateReferees() {
    setBackfillRunning(true);
    setBackfillLog("Populating referees…");
    try {
      const { data, error } = await supabase.functions.invoke("populate-referees", {
        method: "POST", body: {},
      });
      if (error) throw error;
      const r = data as any;
      setBackfillLog(`Referees: ${r.inserted}/${r.distinct_referees} populated.`);
      await refetch();
    } catch (e) {
      setBackfillLog(`Error: ${(e as Error).message}`);
    } finally {
      setBackfillRunning(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          ML Readiness
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">
          Data foundation for offline ML training. Targets: ≥2,000 snapshots, ≥80% odds coverage, zero orphans.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !report ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading dataset report…
          </div>
        ) : (
          <>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              <Metric
                label="Snapshots stored"
                value={report.with_feature_snapshot}
                status={statusOf(report.with_feature_snapshot, { ok: 2000, warn: 500 })}
              />
              <Metric
                label="Snapshot %"
                value={report.with_feature_snapshot_pct}
                suffix="%"
                status={statusOf(report.with_feature_snapshot_pct, { ok: 95, warn: 50 })}
              />
              <Metric
                label="Odds coverage"
                value={report.odds_coverage_pct}
                suffix="%"
                status={statusOf(report.odds_coverage_pct, { ok: 80, warn: 40 })}
              />
              <Metric
                label="Usable samples"
                value={report.usable_training_samples}
                status={statusOf(report.usable_training_samples, { ok: 2000, warn: 500 })}
              />
              <Metric
                label="Reviews"
                value={report.total_reviews}
                status={statusOf(report.total_reviews, { ok: 500, warn: 200 })}
              />
              <Metric
                label="Match features cov."
                value={report.match_features_coverage_pct}
                suffix="%"
                status={statusOf(report.match_features_coverage_pct, { ok: 80, warn: 40 })}
              />
              <Metric
                label="Enrichment cov."
                value={report.match_enrichment_coverage_pct}
                suffix="%"
                status={statusOf(report.match_enrichment_coverage_pct, { ok: 60, warn: 30 })}
              />
              <Metric
                label="Intelligence cov."
                value={report.match_intelligence_coverage_pct}
                suffix="%"
                status={statusOf(report.match_intelligence_coverage_pct, { ok: 60, warn: 30 })}
              />
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>
                    Predictions: <span className="font-mono text-foreground">{report.total_predictions.toLocaleString()}</span>
                    {" "}(published <span className="font-mono">{report.published.toLocaleString()}</span>,
                    {" "}training-only <span className="font-mono">{report.training_only.toLocaleString()}</span>,
                    {" "}low-quality <span className="font-mono">{report.low_quality.toLocaleString()}</span>)
                  </div>
                  <div>
                    Orphans:
                    {" "}preds <span className="font-mono">{report.orphan_rows.predictions}</span>
                    {" "}/ feats <span className="font-mono">{report.orphan_rows.match_features}</span>
                    {" "}/ reviews <span className="font-mono">{report.orphan_rows.prediction_reviews}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => runBackfillLoop(12)}
                    disabled={backfillRunning}
                    className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {backfillRunning ? "Working…" : "Backfill snapshots (300)"}
                  </button>
                  <button
                    onClick={runOddsBackfill}
                    disabled={backfillRunning}
                    className="text-xs px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 disabled:opacity-50"
                  >
                    {backfillRunning ? "Working…" : "Backfill odds"}
                  </button>
                </div>
              </div>
              {backfillLog && (
                <p className="text-[11px] font-mono text-muted-foreground mt-2">{backfillLog}</p>
              )}
            </div>

            {report.missing_fields_top10.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                  Most-missing snapshot fields (last 200)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {report.missing_fields_top10.map((f) => (
                    <span
                      key={f.field}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-muted/50 border border-border/50"
                    >
                      {f.field} <span className="text-muted-foreground">×{f.missing_count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
