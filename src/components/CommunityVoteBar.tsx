import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface CommunityVoteBarProps {
  predictionId: string;
}

export function CommunityVoteBar({ predictionId }: CommunityVoteBarProps) {
  const { user } = useAuth();
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [userVote, setUserVote] = useState<"like" | "dislike" | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchVotes = async () => {
    const { data } = await supabase
      .from("prediction_votes")
      .select("vote_type, user_id")
      .eq("prediction_id", predictionId);

    if (data) {
      setLikes(data.filter((v) => v.vote_type === "like").length);
      setDislikes(data.filter((v) => v.vote_type === "dislike").length);
      if (user) {
        const mine = data.find((v) => v.user_id === user.id);
        setUserVote(mine ? (mine.vote_type as "like" | "dislike") : null);
      }
    }
  };

  useEffect(() => {
    fetchVotes();

    const channel = supabase
      .channel(`votes-${predictionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "prediction_votes", filter: `prediction_id=eq.${predictionId}` }, () => {
        fetchVotes();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [predictionId, user?.id]);

  const handleVote = async (type: "like" | "dislike") => {
    if (!user) {
      toast.error("Please sign in to vote");
      return;
    }
    setLoading(true);
    try {
      if (userVote === type) {
        // Remove vote
        await supabase.from("prediction_votes").delete().eq("prediction_id", predictionId).eq("user_id", user.id);
        setUserVote(null);
      } else {
        // Upsert vote
        await supabase.from("prediction_votes").upsert(
          { prediction_id: predictionId, user_id: user.id, vote_type: type },
          { onConflict: "prediction_id,user_id" }
        );
        setUserVote(type);
      }
    } catch {
      toast.error("Failed to register vote");
    } finally {
      setLoading(false);
    }
  };

  const total = likes + dislikes;
  const confidence = total > 0 ? Math.round((likes / total) * 100) : null;
  const sentiment = confidence === null ? null : confidence >= 70 ? "positive" : confidence >= 40 ? "mixed" : "negative";
  const sentimentConfig = {
    positive: { label: "Strong support", color: "text-green-500", bg: "bg-green-500/10" },
    mixed: { label: "Mixed opinions", color: "text-yellow-500", bg: "bg-yellow-500/10" },
    negative: { label: "Negative sentiment", color: "text-red-500", bg: "bg-red-500/10" },
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Community Feedback
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-center gap-6">
          <Button
            variant={userVote === "like" ? "default" : "outline"}
            size="sm"
            onClick={() => handleVote("like")}
            disabled={loading || !user}
            className="gap-2"
          >
            <ThumbsUp className="h-4 w-4" />
            {likes}
          </Button>
          <Button
            variant={userVote === "dislike" ? "destructive" : "outline"}
            size="sm"
            onClick={() => handleVote("dislike")}
            disabled={loading || !user}
            className="gap-2"
          >
            <ThumbsDown className="h-4 w-4" />
            {dislikes}
          </Button>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-muted p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">Community Confidence</p>
              <p className="text-xs text-muted-foreground">{total} vote{total !== 1 ? "s" : ""}</p>
            </div>
            <div className="text-right space-y-0.5">
              <p className="text-lg font-bold">{confidence}%</p>
              {sentiment && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sentimentConfig[sentiment].bg} ${sentimentConfig[sentiment].color}`}>
                  {sentimentConfig[sentiment].label}
                </span>
              )}
            </div>
          </div>
        )}

        {!user && (
          <p className="text-xs text-muted-foreground text-center">Sign in to vote on this prediction</p>
        )}
      </CardContent>
    </Card>
  );
}
