import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Tier = "trial" | "active" | "past_due" | "canceled" | "expired";

interface SubscriptionState {
  tier: Tier | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  daysLeft: number | null;
  hasAccess: boolean;
  loading: boolean;
}

function computeDaysLeft(tier: Tier | null, trialEndsAt: string | null, currentPeriodEnd: string | null) {
  const target = tier === "trial" ? trialEndsAt : currentPeriodEnd;
  if (!target) return null;
  const ms = new Date(target).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function computeHasAccess(tier: Tier | null, trialEndsAt: string | null, currentPeriodEnd: string | null) {
  if (!tier) return false;
  const now = Date.now();
  if (tier === "trial" && trialEndsAt) return new Date(trialEndsAt).getTime() > now;
  if (tier === "active") return !currentPeriodEnd || new Date(currentPeriodEnd).getTime() > now;
  if (tier === "canceled" && currentPeriodEnd) return new Date(currentPeriodEnd).getTime() > now;
  return false;
}

export function useSubscription(): SubscriptionState {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<SubscriptionState>({
    tier: null,
    trialEndsAt: null,
    currentPeriodEnd: null,
    daysLeft: null,
    hasAccess: false,
    loading: true,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setState({ tier: null, trialEndsAt: null, currentPeriodEnd: null, daysLeft: null, hasAccess: false, loading: false });
      return;
    }

    let active = true;

    const load = async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("tier, trial_ends_at, current_period_end")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;
      const tier = (data?.tier ?? null) as Tier | null;
      const trialEndsAt = data?.trial_ends_at ?? null;
      const currentPeriodEnd = data?.current_period_end ?? null;
      setState({
        tier,
        trialEndsAt,
        currentPeriodEnd,
        daysLeft: computeDaysLeft(tier, trialEndsAt, currentPeriodEnd),
        hasAccess: computeHasAccess(tier, trialEndsAt, currentPeriodEnd),
        loading: false,
      });
    };

    load();

    // Realtime: react to webhook writes (unique channel per hook instance to avoid collisions)
    const channel = supabase
      .channel(`subscription-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user, authLoading]);

  return state;
}
