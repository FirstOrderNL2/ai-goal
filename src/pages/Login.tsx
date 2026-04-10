import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import logoImg from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SEOHead } from "@/components/SEOHead";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function Login() {
  const navigate = useNavigate();
  const { lang } = useParams<{ lang: string }>();
  const prefix = `/${lang || "en"}`;
  const { session } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) navigate(`${prefix}/dashboard`, { replace: true });
  }, [session, navigate, prefix]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    setLoading(false);
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t("login.check_email"));
    }
    setLoading(false);
  };

  const handleOAuthSignIn = async (provider: "apple" | "google") => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(`${provider.charAt(0).toUpperCase() + provider.slice(1)} sign-in failed`);
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <SEOHead titleKey="seo.login_title" descriptionKey="seo.login_description" path="/login" />
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <img src={logoImg} alt="GoalGPT logo" className="h-10 w-10 rounded" />
            <CardTitle className="text-2xl font-bold tracking-tight">
              Goal<span className="text-primary">GPT</span>
            </CardTitle>
          </div>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            className="w-full h-11 gap-2 text-sm font-medium"
            onClick={() => handleOAuthSignIn("google")}
            disabled={loading}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {t("login.google")}
          </Button>

          <Button
            variant="outline"
            className="w-full h-11 gap-2 text-sm font-medium"
            onClick={() => handleOAuthSignIn("apple")}
            disabled={loading}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
            {t("login.apple")}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">{t("login.or")}</span>
            </div>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">{t("login.login_tab")}</TabsTrigger>
              <TabsTrigger value="signup">{t("login.signup_tab")}</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleEmailLogin} className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">{t("login.email")}</Label>
                  <Input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password">{t("login.password")}</Label>
                  <Input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("login.signing_in") : t("login.sign_in_button")}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleEmailSignup} className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email">{t("login.email")}</Label>
                  <Input id="signup-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-password">{t("login.password")}</Label>
                  <Input id="signup-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("login.creating_account") : t("login.create_account_button")}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
