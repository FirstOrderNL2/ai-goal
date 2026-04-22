import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, verifyWebhook } from "../_shared/stripe.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Tier = "trial" | "active" | "past_due" | "canceled" | "expired";

function tierFromStripeStatus(status: string): Tier {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "past_due";
  }
}

async function upsertSubscription(subscription: any) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("Webhook: no userId in subscription metadata", subscription.id);
    return;
  }

  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
  const tier = tierFromStripeStatus(subscription.status);

  const { error } = await supabase
    .from("subscriptions")
    .update({
      tier,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) console.error("Webhook upsert error:", error);
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const url = new URL(req.url);
  const env = (url.searchParams.get("env") || "sandbox") as StripeEnv;

  try {
    const event = await verifyWebhook(req, env);
    console.log("Stripe event:", event.type, "env:", env);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId || session.client_reference_id;
        if (userId && session.customer) {
          await supabase
            .from("subscriptions")
            .update({
              stripe_customer_id: session.customer,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await upsertSubscription(event.data.object);
        break;
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (userId) {
          const periodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;
          // If period_end is in the future, keep access until then via 'canceled' tier;
          // otherwise mark expired.
          const stillActive = periodEnd && new Date(periodEnd) > new Date();
          await supabase
            .from("subscriptions")
            .update({
              tier: stillActive ? "canceled" : "expired",
              current_period_end: periodEnd,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("user_id")
            .eq("stripe_subscription_id", invoice.subscription)
            .maybeSingle();
          if (sub) {
            await supabase
              .from("subscriptions")
              .update({ tier: "past_due", updated_at: new Date().toISOString() })
              .eq("user_id", sub.user_id);
          }
        }
        break;
      }
      default:
        console.log("Unhandled event:", event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response(`Webhook error: ${(e as Error).message}`, { status: 400 });
  }
});
