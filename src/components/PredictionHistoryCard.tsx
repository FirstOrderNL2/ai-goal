import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import type { Prediction } from "@/lib/types";

function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function entryLabel(index: number, total: number, type?: string): string {
  if (type === "HT") return "HT Prediction";
  if (index === total - 1) return "Initial";
  return "Refresh";
}

export function PredictionHistoryCard({ prediction }: { prediction: Prediction }) {
  const intervals = prediction.prediction_intervals;

  const isEmpty = !intervals || intervals.length === 0;

  const sorted = isEmpty ? [] : [...intervals!].reverse();

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-primary" />
          Prediction History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative pl-6 space-y-4">
          {/* vertical line */}
          <div className="absolute left-[9px] top-1 bottom-1 w-px bg-border" />

          {sorted.map((entry, i) => {
            const date = new Date(entry.time);
            const label = entryLabel(i, sorted.length, entry.type);
            const isHT = entry.type === "HT";

            return (
              <div key={i} className="relative flex items-start gap-3">
                <div
                  className={`absolute -left-6 top-1 h-[10px] w-[10px] rounded-full border-2 ${
                    isHT
                      ? "bg-green-500 border-green-500"
                      : "bg-primary border-primary"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-medium ${isHT ? "text-green-500" : "text-foreground"}`}>
                      {label}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {relativeTime(date)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {date.toLocaleString("en-GB", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
