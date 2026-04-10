import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { BarChart3, Brain, Zap, TrendingUp, Eye, Users, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoImg from "@/assets/logo.png";
import { useTranslation, Trans } from "react-i18next";
import { SEOHead } from "@/components/SEOHead";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useAuth } from "@/hooks/useAuth";

export default function Landing() {
  const { t } = useTranslation();
  const { lang } = useParams<{ lang: string }>();
  const prefix = `/${lang || "en"}`;
  const { session } = useAuth();

  const valueCards = [
    { icon: BarChart3, title: t("landing.value_card_1_title"), desc: t("landing.value_card_1_desc") },
    { icon: TrendingUp, title: t("landing.value_card_2_title"), desc: t("landing.value_card_2_desc") },
    { icon: Brain, title: t("landing.value_card_3_title"), desc: t("landing.value_card_3_desc") },
    { icon: Zap, title: t("landing.value_card_4_title"), desc: t("landing.value_card_4_desc") },
  ];

  const steps = [
    { num: 1, icon: BarChart3, title: t("landing.step_1_title"), desc: t("landing.step_1_desc") },
    { num: 2, icon: Brain, title: t("landing.step_2_title"), desc: t("landing.step_2_desc") },
    { num: 3, icon: TrendingUp, title: t("landing.step_3_title"), desc: t("landing.step_3_desc") },
    { num: 4, icon: Zap, title: t("landing.step_4_title"), desc: t("landing.step_4_desc") },
    { num: 5, icon: Eye, title: t("landing.step_5_title"), desc: t("landing.step_5_desc") },
  ];

  const features = [
    { icon: Zap, title: t("landing.feature_1_title"), desc: t("landing.feature_1_desc") },
    { icon: Eye, title: t("landing.feature_2_title"), desc: t("landing.feature_2_desc") },
    { icon: Brain, title: t("landing.feature_3_title"), desc: t("landing.feature_3_desc") },
    { icon: Users, title: t("landing.feature_4_title"), desc: t("landing.feature_4_desc") },
  ];

  useEffect(() => {
    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "name": "GoalGPT",
          "url": "https://goalgpt.io",
          "inLanguage": lang || "en",
          "description": t("seo.landing_description"),
        },
        {
          "@type": "Organization",
          "name": "GoalGPT",
          "url": "https://goalgpt.io",
          "description": "AI-powered football prediction platform",
        },
      ],
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, [lang, t]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead titleKey="seo.landing_title" descriptionKey="seo.landing_description" path="/" />

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between">
          <Link to={prefix} className="flex items-center gap-2">
            <img src={logoImg} alt="GoalGPT logo" className="h-8 w-8 rounded" />
            <span className="text-lg font-bold tracking-tight">
              Goal<span className="text-primary">GPT</span>
            </span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <LanguageSwitcher />
            {session ? (
              <Button size="sm" asChild>
                <Link to={`${prefix}/dashboard`}>{t("landing.dashboard", "Dashboard")}</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                  <Link to={`${prefix}/login`}>{t("landing.sign_in")}</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to={`${prefix}/login`}>
                    <span className="sm:hidden">{t("landing.sign_up", "Sign Up")}</span>
                    <span className="hidden sm:inline">{t("landing.create_free_account")}</span>
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.15),transparent_70%)]" />
        <div className="absolute inset-0" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2340B06A' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="container relative py-24 md:py-36 text-center space-y-6">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-tight">
            {t("landing.hero_title_1")}{" "}
            <span className="text-primary">{t("landing.hero_title_2")}</span>?
          </h1>
          <p className="mx-auto max-w-2xl text-lg md:text-xl text-muted-foreground">
            {t("landing.hero_subtitle")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            {session ? (
              <Button size="lg" className="text-base px-8 h-12" asChild>
                <Link to={`${prefix}/dashboard`}>{t("landing.dashboard", "Dashboard")} <ChevronRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            ) : (
              <>
                <Button size="lg" className="text-base px-8 h-12" asChild>
                  <Link to={`${prefix}/login`}>{t("landing.hero_cta")} <ChevronRight className="ml-1 h-4 w-4" /></Link>
                </Button>
                <Button size="lg" variant="outline" className="text-base px-8 h-12" asChild>
                  <Link to={`${prefix}/login`}>{t("landing.hero_cta_secondary")}</Link>
                </Button>
              </>
            )}
          </div>
          <p className="text-sm text-muted-foreground pt-2">{t("landing.hero_tagline")}</p>
        </div>
      </section>

      {/* Value Explanation */}
      <section className="py-20 md:py-28">
        <div className="container space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              {t("landing.value_heading_1")} <span className="text-primary">{t("landing.value_heading_2")}</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">{t("landing.value_subheading")}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {valueCards.map((c) => (
              <div key={c.title} className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 space-y-3 hover:border-primary/40 transition-colors">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <c.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">{c.title}</h3>
                <p className="text-sm text-muted-foreground">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 md:py-28 bg-card/40">
        <div className="container space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              <Trans i18nKey="landing.how_it_works">
                How <span className="text-primary">GoalGPT</span> works
              </Trans>
            </h2>
          </div>
          <div className="max-w-2xl mx-auto space-y-0">
            {steps.map((s, i) => (
              <div key={s.num} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                    {s.num}
                  </div>
                  {i < steps.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
                </div>
                <div className="pb-8">
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 md:py-28">
        <div className="container space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              <Trans i18nKey="landing.features_heading">
                Why GoalGPT is <span className="text-primary">different</span>
              </Trans>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 space-y-3 hover:border-primary/40 transition-colors">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Example Insight */}
      <section className="py-20 md:py-28 bg-card/40">
        <div className="container max-w-2xl space-y-8">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              <Trans i18nKey="landing.example_heading">
                Example <span className="text-primary">Prediction Insight</span>
              </Trans>
            </h2>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Bayern Munich</span>
              <span className="text-xs text-muted-foreground">{t("landing.example_vs")}</span>
              <span>Real Madrid</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-primary">52%</span>
                <span className="text-draw">20%</span>
                <span className="text-destructive">28%</span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="bg-primary transition-all" style={{ width: "52%" }} />
                <div className="bg-draw transition-all" style={{ width: "20%" }} />
                <div className="bg-destructive transition-all" style={{ width: "28%" }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{t("landing.home")}</span>
                <span>{t("landing.draw")}</span>
                <span>{t("landing.away")}</span>
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground italic leading-relaxed">
              {t("landing.example_quote")}
            </div>
            <p className="text-xs text-muted-foreground text-center">{t("landing.example_caption")}</p>
          </div>
        </div>
      </section>

      {/* Trust & Disclaimer */}
      <section className="py-20 md:py-28">
        <div className="container max-w-2xl">
          <div className="rounded-xl border border-border bg-card p-8 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-draw" />
              <h2 className="text-xl font-bold">{t("landing.disclaimer_title")}</h2>
            </div>
            <ul className="text-sm text-muted-foreground space-y-2 leading-relaxed">
              <li dangerouslySetInnerHTML={{ __html: `• ${t("landing.disclaimer_1")}` }} />
              <li dangerouslySetInnerHTML={{ __html: `• ${t("landing.disclaimer_2")}` }} />
              <li dangerouslySetInnerHTML={{ __html: `• ${t("landing.disclaimer_3")}` }} />
              <li>• {t("landing.disclaimer_4")}</li>
              <li>• {t("landing.disclaimer_5")}</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 md:py-28 bg-card/40">
        <div className="container text-center space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            <Trans i18nKey="landing.cta_heading">
              Ready to <span className="text-primary">stop guessing</span>?
            </Trans>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">{t("landing.cta_subheading")}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button size="lg" className="text-base px-8 h-12" asChild>
              <Link to={`${prefix}/login`}>{t("landing.cta_button")} <ChevronRight className="ml-1 h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 h-12" asChild>
              <Link to={`${prefix}/login`}>{t("landing.cta_button_secondary")}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="container space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={logoImg} alt="GoalGPT logo" className="h-6 w-6 rounded" />
              <span className="font-bold">Goal<span className="text-primary">GPT</span></span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link to={`${prefix}/login`} className="hover:text-foreground transition-colors">{t("landing.sign_in")}</Link>
              <Link to={`${prefix}/login`} className="hover:text-foreground transition-colors">{t("landing.create_account")}</Link>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center leading-relaxed max-w-xl mx-auto">
            {t("landing.footer_disclaimer")}
          </p>
          <p className="text-xs text-muted-foreground text-center">
            {t("landing.footer_copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </footer>
    </div>
  );
}
