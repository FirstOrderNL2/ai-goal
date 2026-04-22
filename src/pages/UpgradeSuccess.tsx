import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";

export default function UpgradeSuccess() {
  const navigate = useNavigate();
  const { lang } = useParams<{ lang: string }>();
  const { tier, loading } = useSubscription();
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (tier === "active") {
      const t = setTimeout(() => navigate(`/${lang || "en"}/dashboard`), 1500);
      return () => clearTimeout(t);
    }
    const t = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(t);
  }, [tier, loading, lang, navigate]);

  const isActive = tier === "active";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-md py-12">
        <Card className="border-primary/30">
          <CardContent className="p-8 text-center space-y-4">
            {isActive ? (
              <>
                <div className="mx-auto h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">You're in 🎉</h1>
                <p className="text-sm text-muted-foreground">Premium unlocked. Redirecting to your dashboard…</p>
              </>
            ) : (
              <>
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
                <h1 className="text-xl font-semibold">Confirming your subscription…</h1>
                <p className="text-sm text-muted-foreground">
                  This usually takes just a moment ({waited}s).
                </p>
                {waited > 20 && (
                  <Button variant="outline" onClick={() => navigate(`/${lang || "en"}/dashboard`)}>
                    Continue to dashboard
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
