import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Artifact = {
  id: string;
  model_family: string;
  status: "champion" | "shadow" | "archived";
  created_at: string;
  promoted_at: string | null;
  rolled_back_at: string | null;
  n_train: number | null;
  n_val: number | null;
  n_holdout: number | null;
  metrics_json: any;
  notes: string | null;
};

type EvaluationRun = {
  id: string;
  artifact_id: string;
  champion_artifact_id: string | null;
  n_examples: number;
  metrics_challenger: any;
  metrics_champion: any;
  passes_gate: boolean;
  gate_reasons: string[];
  created_at: string;
};

function fmt(n: number | null | undefined, digits = 4) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return Number(n).toFixed(digits);
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "champion" ? "default" :
    status === "shadow" ? "secondary" :
    "outline";
  return <Badge variant={variant as any}>{status}</Badge>;
}

export default function AdminModels() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    const [{ data: arts }, { data: evals }] = await Promise.all([
      supabase
        .from("model_artifacts")
        .select("id, model_family, status, created_at, promoted_at, rolled_back_at, n_train, n_val, n_holdout, metrics_json, notes")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("evaluation_runs")
        .select("id, artifact_id, champion_artifact_id, n_examples, metrics_challenger, metrics_champion, passes_gate, gate_reasons, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setArtifacts((arts ?? []) as Artifact[]);
    setEvaluations((evals ?? []) as EvaluationRun[]);
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const champions = artifacts.filter((a) => a.status === "champion");
  const shadows = artifacts.filter((a) => a.status === "shadow");
  const archived = artifacts.filter((a) => a.status === "archived" || a.rolled_back_at);

  const lastEvalForArtifact = (id: string) =>
    evaluations.find((e) => e.artifact_id === id) ?? null;

  const promote = async (artifact_id: string, force = false) => {
    setBusy(artifact_id);
    const { data, error } = await supabase.functions.invoke("promote-model", {
      body: { artifact_id, force },
    });
    setBusy(null);
    if (error) {
      toast({ title: "Promotion failed", description: error.message, variant: "destructive" });
      return;
    }
    if (data?.ok === false) {
      toast({
        title: "Promotion blocked",
        description: (data.reasons ?? []).join("\n") || "gate blocked",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Promoted", description: `Artifact ${artifact_id.slice(0, 8)} is now champion.` });
    reload();
  };

  const rollback = async (artifact_id: string) => {
    setBusy(artifact_id);
    const { data, error } = await supabase.functions.invoke("rollback-model", {
      body: { artifact_id },
    });
    setBusy(null);
    if (error) {
      toast({ title: "Rollback failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Rolled back", description: JSON.stringify(data) });
    reload();
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">Model Registry</h1>
        <p className="text-muted-foreground">
          Champions, shadow challengers, and evaluation history. Promotion is human-only and gated.
        </p>
      </div>

      {loading ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Loading…</CardContent></Card>
      ) : (
        <>
          {/* Champions */}
          <Card>
            <CardHeader><CardTitle>Champions</CardTitle></CardHeader>
            <CardContent>
              {champions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No champion artifact yet — production runs on the static baseline.</p>
              ) : (
                <div className="space-y-3">
                  {champions.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={a.status} />
                          <span className="font-mono text-xs">{a.id.slice(0, 8)}</span>
                          <span className="text-sm font-medium">{a.model_family}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          promoted {a.promoted_at ? new Date(a.promoted_at).toLocaleString() : "—"} · n_train {a.n_train} · n_holdout {a.n_holdout}
                        </div>
                        <div className="mt-1 text-xs">
                          LL {fmt(a.metrics_json?.overall?.log_loss)} · Brier {fmt(a.metrics_json?.overall?.brier)} · ECE {fmt(a.metrics_json?.overall?.ece)}
                        </div>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" disabled={busy === a.id}>Rollback</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Rollback champion?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will demote the current champion of {a.model_family}. The previous archived champion (if any) becomes active again.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => rollback(a.id)}>Confirm rollback</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shadow artifacts */}
          <Card>
            <CardHeader><CardTitle>Shadow challengers</CardTitle></CardHeader>
            <CardContent>
              {shadows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shadow challengers right now. They appear automatically after a successful nightly training job.</p>
              ) : (
                <div className="space-y-4">
                  {shadows.map((a) => {
                    const ev = lastEvalForArtifact(a.id);
                    return (
                      <div key={a.id} className="rounded-lg border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={a.status} />
                              <span className="font-mono text-xs">{a.id.slice(0, 8)}</span>
                              <span className="text-sm font-medium">{a.model_family}</span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              created {new Date(a.created_at).toLocaleString()} · n_train {a.n_train ?? "—"} · n_holdout {a.n_holdout ?? "—"}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" disabled={busy === a.id}>Promote</Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Promote this challenger to champion?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Promotion is gated by metric improvements AND evidence volume (≥100 holdout, ≥400 total labeled). Use Force only if you know what you're doing.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => promote(a.id, false)}>Promote (gated)</AlertDialogAction>
                                  <AlertDialogAction onClick={() => promote(a.id, true)}>Force promote</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>

                        {ev ? (
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div className="rounded bg-muted p-3 text-xs">
                              <div className="font-semibold mb-1">Challenger (n={ev.n_examples})</div>
                              <div>LL {fmt(ev.metrics_challenger?.log_loss)} · Brier {fmt(ev.metrics_challenger?.brier)} · RPS {fmt(ev.metrics_challenger?.rps)}</div>
                              <div>ECE {fmt(ev.metrics_challenger?.ece)} · MAE {fmt(ev.metrics_challenger?.mae_goals)} · Acc {fmt(ev.metrics_challenger?.accuracy, 3)}</div>
                            </div>
                            <div className="rounded bg-muted p-3 text-xs">
                              <div className="font-semibold mb-1">Champion (same matches)</div>
                              <div>LL {fmt(ev.metrics_champion?.log_loss)} · Brier {fmt(ev.metrics_champion?.brier)} · RPS {fmt(ev.metrics_champion?.rps)}</div>
                              <div>ECE {fmt(ev.metrics_champion?.ece)} · MAE {fmt(ev.metrics_champion?.mae_goals)} · Acc {fmt(ev.metrics_champion?.accuracy, 3)}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-muted-foreground">No evaluation yet. Waiting for shadow_predictions × labels.</div>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold">Gate:</span>
                          {ev ? (
                            ev.passes_gate ? (
                              <Badge>passes</Badge>
                            ) : (
                              <>
                                <Badge variant="destructive">blocked</Badge>
                                {ev.gate_reasons.map((r, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">{r}</Badge>
                                ))}
                              </>
                            )
                          ) : (
                            <Badge variant="outline">pending</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Archived */}
          <Card>
            <CardHeader><CardTitle>Archived & rolled-back</CardTitle></CardHeader>
            <CardContent>
              {archived.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing archived yet.</p>
              ) : (
                <div className="space-y-2">
                  {archived.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-xs border-b py-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={a.status} />
                        <span className="font-mono">{a.id.slice(0, 8)}</span>
                        <span>{a.model_family}</span>
                      </div>
                      <div className="text-muted-foreground">
                        {a.rolled_back_at ? `rolled back ${new Date(a.rolled_back_at).toLocaleDateString()}` : `created ${new Date(a.created_at).toLocaleDateString()}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
