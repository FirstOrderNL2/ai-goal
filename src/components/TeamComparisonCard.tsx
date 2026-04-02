import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import type { MatchFeatures, Team } from "@/lib/types";

interface Props {
  features: MatchFeatures;
  homeTeam?: Team;
  awayTeam?: Team;
}

function FormPills({ form }: { form: string }) {
  return (
    <div className="flex gap-1">
      {form.split("").map((c, i) => (
        <span key={i} className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center ${
          c === "W" ? "bg-green-500/20 text-green-500" :
          c === "D" ? "bg-yellow-500/20 text-yellow-500" :
          "bg-red-500/20 text-red-500"
        }`}>{c}</span>
      ))}
    </div>
  );
}

function StatBar({ label, homeVal, awayVal, format: fmt = "number" }: {
  label: string; homeVal: number; awayVal: number; format?: "number" | "pct";
}) {
  const max = Math.max(homeVal, awayVal, 0.01);
  const homeW = (homeVal / max) * 100;
  const awayW = (awayVal / max) * 100;
  const display = (v: number) => fmt === "pct" ? `${Math.round(v * 100)}%` : v.toFixed(2);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{display(homeVal)}</span>
        <span>{label}</span>
        <span className="font-semibold text-foreground">{display(awayVal)}</span>
      </div>
      <div className="flex gap-1 h-2">
        <div className="flex-1 flex justify-end">
          <div className="h-full rounded-l bg-primary/60" style={{ width: `${homeW}%` }} />
        </div>
        <div className="flex-1">
          <div className="h-full rounded-r bg-destructive/60" style={{ width: `${awayW}%` }} />
        </div>
      </div>
    </div>
  );
}

export function TeamComparisonCard({ features, homeTeam, awayTeam }: Props) {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          Team Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Form */}
        {(features.home_form_last5 || features.away_form_last5) && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{homeTeam?.name} Form</p>
              <FormPills form={features.home_form_last5 || ""} />
            </div>
            <div className="space-y-1 text-right">
              <p className="text-xs text-muted-foreground">{awayTeam?.name} Form</p>
              <div className="flex justify-end">
                <FormPills form={features.away_form_last5 || ""} />
              </div>
            </div>
          </div>
        )}

        {/* League positions */}
        {(features.league_position_home != null || features.league_position_away != null) && (
          <div className="flex justify-between items-center rounded-lg bg-muted p-3">
            <div className="text-center">
              <p className="text-lg font-bold text-primary">
                {features.league_position_home != null ? `#${features.league_position_home}` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">{homeTeam?.name}</p>
            </div>
            <p className="text-xs text-muted-foreground">League Position</p>
            <div className="text-center">
              <p className="text-lg font-bold text-primary">
                {features.league_position_away != null ? `#${features.league_position_away}` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">{awayTeam?.name}</p>
            </div>
          </div>
        )}

        {/* Stat bars */}
        <div className="space-y-3">
          <StatBar label="Avg Goals Scored" homeVal={Number(features.home_avg_scored)} awayVal={Number(features.away_avg_scored)} />
          <StatBar label="Avg Goals Conceded" homeVal={Number(features.home_avg_conceded)} awayVal={Number(features.away_avg_conceded)} />
          <StatBar label="Clean Sheet %" homeVal={Number(features.home_clean_sheet_pct)} awayVal={Number(features.away_clean_sheet_pct)} format="pct" />
          <StatBar label="BTTS %" homeVal={Number(features.home_btts_pct)} awayVal={Number(features.away_btts_pct)} format="pct" />
        </div>

        {/* Poisson xG */}
        {Number(features.poisson_xg_home) > 0 && (
          <div className="rounded-lg bg-muted p-3 text-center">
            <p className="text-lg font-bold tabular-nums">
              {Number(features.poisson_xg_home).toFixed(1)} - {Number(features.poisson_xg_away).toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">Poisson Expected Goals</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
