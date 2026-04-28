// Phase 3.5: learning-pipeline readiness card.
// Shows live counts that prove the loop is feeding itself.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Database, GraduationCap, Target, AlertTriangle } from "lucide-react";

const SHADOW_THRESHOLD = 200;

async function fetchPipelineCounts() {
  const sinceDay = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const sinceWeek = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [
    { count: preMatchTotal },
    { count: preMatch24h },
    { count: preMatch7d },
    { count: labels },
    { count: labels7d },
    { count: calibration },
    { count: training },
    { count: jobsQueued },
    { count: jobsRunning },
    { count: jobsSucceeded },
    { count: jobsFailed },
    { count: artifactsShadow },
    { count: artifactsChampion },
    { data: lastJobs },
    { data: dailySnapshots },
  ] = await Promise.all([
    supabase.from("prediction_runs").select("id", { count: "exact", head: true }).eq("run_type", "pre_match"),
    supabase.from("prediction_runs").select("id", { count: "exact", head: true }).eq("run_type", "pre_match").gte("created_at", sinceDay),
    supabase.from("prediction_runs").select("id", { count: "exact", head: true }).eq("run_type", "pre_match").gte("created_at", sinceWeek),
    supabase.from("match_labels").select("match_id", { count: "exact", head: true }),
    supabase.from("match_labels").select("match_id", { count: "exact", head: true }).gte("finalized_at", sinceWeek),
    supabase.from("calibration_events").select("id", { count: "exact", head: true }),
    supabase.from("training_examples").select("id", { count: "exact", head: true }),
    supabase.from("training_jobs").select("id", { count: "exact", head: true }).eq("status", "queued"),
    supabase.from("training_jobs").select("id", { count: "exact", head: true }).eq("status", "running"),
    supabase.from("training_jobs").select("id", { count: "exact", head: true }).eq("status", "succeeded"),
    supabase.from("training_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("model_artifacts").select("id", { count: "exact", head: true }).eq("status", "shadow"),
    supabase.from("model_artifacts").select("id", { count: "exact", head: true }).eq("status", "champion"),
    supabase.from("training_jobs").select("id, status, decision, n_train, n_holdout, created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("pipeline_health").select("created_at, details").eq("check_type", "daily_counters").order("created_at", { ascending: false }).limit(14),
  ]);

  return {
    preMatchTotal: preMatchTotal ?? 0,
    preMatch24h: preMatch24h ?? 0,
    preMatch7d: preMatch7d ?? 0,
    labels: labels ?? 0,
    labels7d: labels7d ?? 0,
    calibration: calibration ?? 0,
    training: training ?? 0,
    jobsQueued: jobsQueued ?? 0,
    jobsRunning: jobsRunning ?? 0,
    jobsSucceeded: jobsSucceeded ?? 0,
    jobsFailed: jobsFailed ?? 0,
    artifactsShadow: artifactsShadow ?? 0,
    artifactsChampion: artifactsChampion ?? 0,
    lastJobs: lastJobs ?? [],
  };
}

export function LearningPipelineCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["pipeline-counts"],
    queryFn: fetchPipelineCounts,
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return (
      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Activity className="h-5 w-5 text-primary" /> Learning Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  const inShadow = data.training < SHADOW_THRESHOLD;

  return (
    <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Activity className="h-5 w-5 text-primary" /> Learning Pipeline
          {inShadow ? (
            <Badge variant="outline" className="ml-2 border-yellow-500/40 text-yellow-400">
              Shadow mode
            </Badge>
          ) : (
            <Badge className="ml-2 bg-primary/20 text-primary border-primary/40">Live</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {inShadow && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div>
              Training in shadow mode. Promotion blocked until ≥ {SHADOW_THRESHOLD} labeled
              pre-match examples (currently {data.training}).
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Pre-match runs" value={data.preMatchTotal} sub={`+${data.preMatch24h} / 24h`} icon={<Database className="h-4 w-4" />} />
          <Stat label="Match labels" value={data.labels} sub={`+${data.labels7d} / 7d`} icon={<Target className="h-4 w-4" />} />
          <Stat label="Calibration events" value={data.calibration} icon={<Activity className="h-4 w-4" />} />
          <Stat label="Training examples" value={data.training} icon={<GraduationCap className="h-4 w-4" />} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Jobs queued" value={data.jobsQueued} />
          <Stat label="Jobs running" value={data.jobsRunning} />
          <Stat label="Jobs succeeded" value={data.jobsSucceeded} />
          <Stat label="Jobs failed" value={data.jobsFailed} highlight={data.jobsFailed > 0 ? "danger" : undefined} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Shadow artifacts" value={data.artifactsShadow} />
          <Stat label="Champion artifacts" value={data.artifactsChampion} />
        </div>

        {data.lastJobs.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Recent training jobs</div>
            <div className="space-y-1">
              {data.lastJobs.map((j: any) => (
                <div key={j.id} className="flex items-center justify-between text-xs rounded border border-border/40 px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{j.status}</Badge>
                    <span className="text-muted-foreground">{j.decision ?? "—"}</span>
                  </div>
                  <span className="text-muted-foreground tabular-nums">
                    n={j.n_train ?? 0}/{j.n_holdout ?? 0} · {new Date(j.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
  highlight,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon?: React.ReactNode;
  highlight?: "danger";
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        highlight === "danger" ? "border-destructive/50 bg-destructive/10" : "border-border/40 bg-background/40"
      }`}
    >
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-lg font-semibold text-foreground tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
