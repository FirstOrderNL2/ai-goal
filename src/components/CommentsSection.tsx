import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Comment {
  id: string;
  user_id: string;
  comment: string;
  created_at: string;
  profile?: { display_name: string | null; avatar_url: string | null };
}

interface CommentsSectionProps {
  predictionId: string;
}

export function CommentsSection({ predictionId }: CommentsSectionProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);

  const fetchComments = async () => {
    const { data } = await supabase
      .from("prediction_comments")
      .select("id, user_id, comment, created_at")
      .eq("prediction_id", predictionId)
      .order("created_at", { ascending: false });

    if (!data) return;

    // Fetch profiles for comment authors
    const userIds = [...new Set(data.map((c) => c.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url")
      .in("user_id", userIds);

    const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

    setComments(
      data.map((c) => ({
        ...c,
        profile: profileMap.get(c.user_id) ?? undefined,
      }))
    );
  };

  useEffect(() => {
    fetchComments();

    const channel = supabase
      .channel(`comments-${predictionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "prediction_comments", filter: `prediction_id=eq.${predictionId}` }, () => {
        fetchComments();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [predictionId]);

  const handlePost = async () => {
    if (!user || !newComment.trim()) return;
    if (newComment.length > 1000) {
      toast.error("Comment must be under 1000 characters");
      return;
    }
    setPosting(true);
    const { error } = await supabase.from("prediction_comments").insert({
      prediction_id: predictionId,
      user_id: user.id,
      comment: newComment.trim(),
    });
    if (error) {
      toast.error("Failed to post comment");
    } else {
      setNewComment("");
    }
    setPosting(false);
  };

  const handleDelete = async (commentId: string) => {
    const { error } = await supabase.from("prediction_comments").delete().eq("id", commentId);
    if (error) toast.error("Failed to delete comment");
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "?";
    return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-primary" />
          Discussion ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {user && (
          <div className="flex gap-2">
            <Textarea
              placeholder="Share your thoughts on this prediction…"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              maxLength={1000}
              className="min-h-[60px] resize-none"
            />
            <Button
              size="icon"
              onClick={handlePost}
              disabled={posting || !newComment.trim()}
              className="shrink-0 self-end"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}

        {!user && (
          <p className="text-xs text-muted-foreground text-center">Sign in to join the discussion</p>
        )}

        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3 rounded-lg bg-muted/50 p-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={c.profile?.avatar_url ?? undefined} />
                <AvatarFallback className="text-xs">{getInitials(c.profile?.display_name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{c.profile?.display_name || "Anonymous"}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground break-words">{c.comment}</p>
              </div>
              {user?.id === c.user_id && (
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 self-start" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No comments yet. Be the first to share your thoughts!</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
