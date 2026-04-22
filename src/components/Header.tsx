import { useState, useEffect } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Activity, BarChart3, Users, Database, Trophy, Menu, X, Moon, Sun, LogOut, Shield } from "lucide-react";
import logoImg from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { TrialBanner } from "@/components/TrialBanner";

export function Header() {
  const location = useLocation();
  const { lang } = useParams<{ lang: string }>();
  const prefix = `/${lang || "en"}`;
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(() => !document.documentElement.classList.contains("light"));
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null }>({
    display_name: null,
    avatar_url: null,
  });

  const navItems = [
    { to: `${prefix}/dashboard`, label: t("nav.dashboard"), icon: Activity },
    { to: `${prefix}/standings`, label: t("nav.standings"), icon: Trophy },
    { to: `${prefix}/leaderboard`, label: t("nav.leaderboard"), icon: Shield },
    { to: `${prefix}/accuracy`, label: t("nav.accuracy"), icon: BarChart3 },
    { to: `${prefix}/teams`, label: t("nav.teams"), icon: Users },
    { to: `${prefix}/statsbomb`, label: t("nav.statsbomb"), icon: Database },
  ];

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [user]);

  const toggleTheme = () => {
    if (dark) {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
    setDark(!dark);
  };

  const displayName = profile.display_name || user?.email?.split("@")[0] || "User";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <TrialBanner />
      <div className="container flex h-14 items-center justify-between">
        <Link to={`${prefix}/dashboard`} className="flex items-center gap-2">
          <img src={logoImg} alt="GoalGPT logo" className="h-8 w-8 rounded" />
          <span className="text-lg font-bold tracking-tight">
            Goal<span className="text-primary">GPT</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
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
              <span>{label}</span>
            </Link>
          ))}

          <LanguageSwitcher />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative ml-1 h-8 w-8 rounded-full p-0">
                <Avatar className="h-8 w-8">
                  {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium leading-none">{displayName}</p>
                  {user?.email && (
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to={`${prefix}/profile`} className="cursor-pointer">
                  <Shield className="mr-2 h-4 w-4" />
                  {t("nav.profile_settings")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleTheme}>
                {dark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                {dark ? t("nav.light_mode") : t("nav.dark_mode")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                {t("nav.sign_out")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* Mobile controls */}
        <div className="flex sm:hidden items-center gap-1">
          <LanguageSwitcher />
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)} className="h-8 w-8">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <nav className="sm:hidden border-t border-border bg-background px-4 pb-4 pt-2 space-y-1">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Avatar className="h-8 w-8">
              {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{displayName}</span>
              {user?.email && <span className="text-xs text-muted-foreground">{user.email}</span>}
            </div>
          </div>
          <div className="h-px bg-border my-1" />
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                location.pathname === to
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          <Link
            to={`${prefix}/profile`}
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Shield className="h-4 w-4" />
            {t("nav.profile_settings")}
          </Link>
          <div className="h-px bg-border my-1" />
          <button
            onClick={() => { setMobileOpen(false); signOut(); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {t("nav.sign_out")}
          </button>
        </nav>
      )}
    </header>
  );
}
