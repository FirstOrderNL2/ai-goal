import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Trophy, Target, CheckCircle } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { getStripeEnvironment } from "@/lib/stripe";

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { lang } = useParams<{ lang: string }>();
  const langPrefix = `/${lang || "en"}`;
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const subscription = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);

  const openCustomerPortal = async () => {
    setPortalLoading(true);
    const { data, error } = await supabase.functions.invoke("create-portal-session", {
      body: { returnUrl: window.location.href, environment: getStripeEnvironment() },
    });
    setPortalLoading(false);
    if (error || !data?.url) {
      toast({ title: "Couldn't open portal", description: error?.message || "Try again later", variant: "destructive" });
      return;
    }
    window.open(data.url, "_blank", "noopener");
  };

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [perf, setPerf] = useState<{
    total_votes: number; correct_votes: number; accuracy_score: number; trust_score: number; tier: string;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name ?? "");
          setAvatarUrl(data.avatar_url);
        }
      });
    supabase
      .from("user_performance")
      .select("total_votes, correct_votes, accuracy_score, trust_score, tier")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => { if (data) setPerf(data); });
  }, [user]);

  const initials = (displayName || user?.email?.split("@")[0] || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSaveName = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("user_id", user.id);
    setSaving(false);
    toast(error ? { title: "Error", description: error.message, variant: "destructive" } : { title: "Saved", description: "Display name updated." });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const path = `${user.id}/avatar`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", user.id);
    setAvatarUrl(url);
    setUploading(false);
    toast({ title: "Avatar updated" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-lg py-8 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Profile Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
                  <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="absolute bottom-0 right-0 rounded-full bg-primary p-1.5 text-primary-foreground shadow hover:bg-primary/90 transition-colors"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </div>
              <p className="text-xs text-muted-foreground">Click the camera icon to upload a photo</p>
            </div>

            {/* Display name */}
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
            </div>

            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled className="opacity-60" />
            </div>

            <Button onClick={handleSaveName} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* Prediction Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              My Prediction Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            {perf ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-2xl font-bold">{perf.total_votes}</p>
                    <p className="text-xs text-muted-foreground">Total Votes</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-2xl font-bold">{perf.correct_votes}</p>
                    <p className="text-xs text-muted-foreground">Correct</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-2xl font-bold">
                      {perf.total_votes > 0 ? Math.round((perf.correct_votes / perf.total_votes) * 100) : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">Accuracy</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-2xl font-bold">{Number(perf.trust_score).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Trust Score</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="capitalize">{perf.tier} tier</Badge>
                  <Link to="/leaderboard" className="text-sm text-primary hover:underline flex items-center gap-1">
                    <Trophy className="h-3.5 w-3.5" /> View Leaderboard
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Start voting on predictions to track your stats.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
