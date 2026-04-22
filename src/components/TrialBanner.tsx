import { Link, useParams } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, AlertTriangle, Lock } from "lucide-react";

export function TrialBanner() {
  const { user } = useAuth();
  const { tier, daysLeft, hasAccess, loading } = useSubscription();
  const { lang } = useParams<{ lang: string }>();
  const prefix = `/${lang || "en"}`;

  if (!user || loading) return null;
  if (tier === "active") return null; // paid users: no banner

  // Trial active
  if (tier === "trial" && hasAccess && daysLeft != null) {
    const isWarn = daysLeft <= 5;
    const tone = isWarn
      ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
      : "bg-primary/10 border-primary/30 text-primary";
    return (
      <div className={`w-full border-b ${tone}`}>
        <div className="container flex h-9 items-center justify-between gap-3 text-xs sm:text-sm font-medium">
          <div className="flex items-center gap-2 truncate">
            {isWarn ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <Sparkles className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">
              {daysLeft === 0
                ? "Free trial ends today"
                : `Free trial — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
            </span>
          </div>
          <Link to={`${prefix}/upgrade`} className="shrink-0 underline underline-offset-2 hover:opacity-80">
            Upgrade →
          </Link>
        </div>
      </div>
    );
  }

  // Trial expired / canceled / past_due → no access
  if (!hasAccess) {
    return (
      <div className="w-full border-b bg-destructive/15 border-destructive/40 text-destructive">
        <div className="container flex h-9 items-center justify-between gap-3 text-xs sm:text-sm font-medium">
          <div className="flex items-center gap-2 truncate">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {tier === "past_due" ? "Payment failed — restore access" : "Trial ended"}
            </span>
          </div>
          <Link to={`${prefix}/upgrade`} className="shrink-0 underline underline-offset-2 hover:opacity-80">
            Upgrade for €10/mo →
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
