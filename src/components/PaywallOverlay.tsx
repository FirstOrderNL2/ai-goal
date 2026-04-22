import { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";

interface PaywallOverlayProps {
  children: ReactNode;
  /** Optional override; defaults to the global subscription state. */
  locked?: boolean;
}

/**
 * Wraps premium content. When the user lacks access, renders the children
 * blurred + non-interactive with a centered upgrade card on top.
 */
export function PaywallOverlay({ children, locked }: PaywallOverlayProps) {
  const { hasAccess, loading } = useSubscription();
  const { lang } = useParams<{ lang: string }>();
  const prefix = `/${lang || "en"}`;

  const isLocked = locked ?? (!loading && !hasAccess);
  if (!isLocked) return <>{children}</>;

  return (
    <div className="relative">
      <div aria-hidden className="blur-md pointer-events-none select-none opacity-70">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-w-sm w-full rounded-xl border border-primary/30 bg-background/90 backdrop-blur shadow-xl p-5 text-center space-y-3">
          <div className="mx-auto h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-base font-semibold">Premium prediction</p>
            <p className="text-sm text-muted-foreground">
              Upgrade to unlock AI reasoning, Confidence Engine and Value Bets.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link to={`${prefix}/upgrade`}>Upgrade · €10/mo</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
