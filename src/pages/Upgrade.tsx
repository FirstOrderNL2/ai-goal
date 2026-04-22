import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { useSubscription } from "@/hooks/useSubscription";
import { useState } from "react";

const FEATURES = [
  "Live AI predictions for every match",
  "Confidence Engine 2.0 with composite scoring",
  "Value Bet detection vs bookmaker odds",
  "AI reasoning + post-match reviews",
  "Pre-match recheck updates every 10 minutes",
  "Multilingual (EN / DE) and full match intelligence",
];

export default function Upgrade() {
  const navigate = useNavigate();
  const { lang } = useParams<{ lang: string }>();
  const { tier, hasAccess } = useSubscription();
  const [showCheckout, setShowCheckout] = useState(false);

  const returnUrl = `${window.location.origin}/${lang || "en"}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`;

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />
      <Header />
      <main className="container max-w-2xl py-8 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        {tier === "active" && hasAccess ? (
          <Card className="border-primary/30">
            <CardContent className="p-6 text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/15 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-bold">You're already Premium</h2>
              <p className="text-sm text-muted-foreground">Manage your subscription from your profile.</p>
              <Button onClick={() => navigate(`/${lang || "en"}/profile`)}>Go to profile</Button>
            </CardContent>
          </Card>
        ) : showCheckout ? (
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle>Complete your subscription</CardTitle>
            </CardHeader>
            <CardContent>
              <StripeEmbeddedCheckout priceId="goalgpt_premium_monthly" returnUrl={returnUrl} />
              <Button
                variant="ghost"
                size="sm"
                className="mt-4"
                onClick={() => setShowCheckout(false)}
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-primary/30 bg-gradient-to-b from-primary/5 to-transparent">
            <CardHeader className="text-center space-y-2 pb-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/15 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">GoalGPT Premium</CardTitle>
              <p className="text-sm text-muted-foreground">
                Full access to predictions, intelligence and value bets.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <span className="text-5xl font-bold tracking-tight">€10</span>
                <span className="text-muted-foreground"> / month</span>
                <p className="text-xs text-muted-foreground mt-1">VAT calculated automatically. Cancel anytime.</p>
              </div>

              <ul className="space-y-2.5">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button size="lg" className="w-full" onClick={() => setShowCheckout(true)}>
                Subscribe — €10/mo
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
