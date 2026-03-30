import { Link, useLocation } from "react-router-dom";
import { Activity, BarChart3, Shield, Users, Database, Trophy } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: Activity },
  { to: "/standings", label: "Standings", icon: Trophy },
  { to: "/accuracy", label: "Accuracy", icon: BarChart3 },
  { to: "/teams", label: "Teams", icon: Users },
  { to: "/statsbomb", label: "StatsBomb", icon: Database },
];

export function Header() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">
            Football<span className="text-primary">AI</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                location.pathname === to
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
