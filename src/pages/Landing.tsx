import { Link } from "react-router-dom";
import { Shield, BarChart3, Brain, Zap, TrendingUp, Eye, Users, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const valueCards = [
  { icon: BarChart3, title: "Historical Match Data", desc: "Years of match results, scores, and statistics analyzed" },
  { icon: TrendingUp, title: "Team Performance Trends", desc: "Form, momentum, home/away records tracked in real-time" },
  { icon: Brain, title: "AI Reasoning Engine", desc: "Advanced models that find patterns humans miss" },
  { icon: Zap, title: "Live Football Insights", desc: "Injuries, lineups, weather, and context factored in" },
];

const steps = [
  { num: 1, icon: BarChart3, title: "We analyze match data", desc: "Historical results, team stats, head-to-head records" },
  { num: 2, icon: Brain, title: "AI processes patterns & context", desc: "Our model weighs dozens of factors simultaneously" },
  { num: 3, icon: TrendingUp, title: "Statistical model calculates probabilities", desc: "Poisson distributions, xG models, form analysis" },
  { num: 4, icon: Zap, title: "Insights are generated", desc: "Context-aware reasoning explains the prediction" },
  { num: 5, icon: Eye, title: "You get a clear prediction + explanation", desc: "Transparent probabilities with full reasoning shown" },
];

const features = [
  { icon: Zap, title: "AI + Statistics Combined", desc: "Not guesswork — data-driven predictions powered by machine learning and statistical models." },
  { icon: Eye, title: "Transparent Predictions", desc: "See exactly why a prediction is made. Every factor, every weight, fully visible." },
  { icon: Brain, title: "Smart Insights", desc: "AI explains match context — injuries, form, momentum, historical patterns, and more." },
  { icon: Users, title: "Community Intelligence", desc: "Compare AI predictions vs crowd sentiment. Weighted by user accuracy. Coming soon." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold tracking-tight">
              Goal<span className="text-primary">GPT</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Sign In</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/login">Create Free Account</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.15),transparent_70%)]" />
        <div className="absolute inset-0" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2340B06A' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="container relative py-24 md:py-36 text-center space-y-6">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-tight">
            Why gamble… when you can{" "}
            <span className="text-primary">predict with intelligence</span>?
          </h1>
          <p className="mx-auto max-w-2xl text-lg md:text-xl text-muted-foreground">
            GoalGPT combines AI, statistics, and real match data to help you understand football outcomes — not guess them.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <Button size="lg" className="text-base px-8 h-12" asChild>
              <Link to="/login">Create Free Account <ChevronRight className="ml-1 h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 h-12" asChild>
              <Link to="/login">View Predictions</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground pt-2">Smarter predictions powered by AI + real data</p>
        </div>
      </section>

      {/* Value Explanation */}
      <section className="py-20 md:py-28">
        <div className="container space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Stop guessing. <span className="text-primary">Start understanding.</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              GoalGPT turns raw football data into clear, probability-based predictions with full explanations.
            </p>
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
              How <span className="text-primary">GoalGPT</span> works
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
              Why GoalGPT is <span className="text-primary">different</span>
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
              Example <span className="text-primary">Prediction Insight</span>
            </h2>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Bayern Munich</span>
              <span className="text-xs text-muted-foreground">vs</span>
              <span>Real Madrid</span>
            </div>
            {/* Mock probability bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-primary">52%</span>
                <span className="text-yellow-400">20%</span>
                <span className="text-destructive">28%</span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="bg-primary transition-all" style={{ width: "52%" }} />
                <div className="bg-yellow-400 transition-all" style={{ width: "20%" }} />
                <div className="bg-destructive transition-all" style={{ width: "28%" }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Home</span>
                <span>Draw</span>
                <span>Away</span>
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground italic leading-relaxed">
              "Bayern looks stronger statistically… but Real Madrid at home in Champions League matches often outperform expectations. Historical H2H shows Real winning 60% of knockout-stage meetings."
            </div>
            <p className="text-xs text-muted-foreground text-center">
              GoalGPT shows both sides of every match.
            </p>
          </div>
        </div>
      </section>

      {/* Trust & Disclaimer */}
      <section className="py-20 md:py-28">
        <div className="container max-w-2xl">
          <div className="rounded-xl border border-border bg-card p-8 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              <h2 className="text-xl font-bold">Important Notice</h2>
            </div>
            <ul className="text-sm text-muted-foreground space-y-2 leading-relaxed">
              <li>• GoalGPT provides <strong className="text-foreground">independent AI-generated predictions</strong> based on data, statistics, and historical trends.</li>
              <li>• Predictions are <strong className="text-foreground">NOT guaranteed</strong> — no prediction system can be 100% accurate.</li>
              <li>• This is <strong className="text-foreground">NOT financial or betting advice</strong>.</li>
              <li>• Users are fully responsible for their own decisions.</li>
              <li>• GoalGPT is not liable for any losses incurred.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 md:py-28 bg-card/40">
        <div className="container text-center space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Ready to <span className="text-primary">stop guessing</span>?
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Join users who analyze football smarter — not harder.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button size="lg" className="text-base px-8 h-12" asChild>
              <Link to="/login">Create Free Account <ChevronRight className="ml-1 h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 h-12" asChild>
              <Link to="/login">Explore Predictions</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="container space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-bold">Goal<span className="text-primary">GPT</span></span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link to="/login" className="hover:text-foreground transition-colors">Sign In</Link>
              <Link to="/login" className="hover:text-foreground transition-colors">Create Account</Link>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center leading-relaxed max-w-xl mx-auto">
            GoalGPT provides AI-generated predictions for informational purposes only. Predictions are not guaranteed and do not constitute financial or betting advice. Users are responsible for their own decisions.
          </p>
          <p className="text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} GoalGPT. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
