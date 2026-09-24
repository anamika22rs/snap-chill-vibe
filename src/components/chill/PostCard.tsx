import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Send, MoreHorizontal, Trash2, EyeOff, Flag, Ban } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Ava } from "./Ava";
import { Media } from "./Media";
import { timeAgo, type Post, type Profile } from "@/lib/chill";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type FeedPost = Post & {
  author: Profile;
  likes: number;
  liked: boolean;
  comments: number;
};

export function PostCard({ post, meId }: { post: FeedPost; meId: string }) {
  const qc = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [draft, setDraft] = useState("");
  const [burst, setBurst] = useState(false);

  const toggleLike = useMutation({
    mutationFn: async () => {
      if (post.liked) {
        await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", meId);
      } else {
        await supabase.from("post_likes").insert({ post_id: post.id, user_id: meId });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed"] }),
  });

  const comments = useQuery({
    queryKey: ["comments", post.id],
    enabled: showComments,
    queryFn: async () => {
      const { data } = await supabase
        .from("comments")
        .select("*, author:profiles!comments_author_fkey(*)")
        .eq("post_id", post.id)
        .order("created_at");
      return (data ?? []) as Array<{
        id: string;
        body: string;
        created_at: string;
        user_id: string;
        author: Profile;
      }>;
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      const body = draft.trim();
      if (!body) return;
      const { error } = await supabase
        .from("comments")
        .insert({ post_id: post.id, user_id: meId, body });
      if (error) throw error;
      setDraft("");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", post.id] });
      qc.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const action = useMutation({
    mutationFn: async (kind: "hide" | "report" | "block" | "delete") => {
      if (kind === "hide") {
        await supabase.from("hidden_posts").insert({ user_id: meId, post_id: post.id });
        toast.success("Post hidden");
      }
      if (kind === "report") {
        await supabase.from("reports").insert({
          reporter_id: meId,
          target_post_id: post.id,
          target_user_id: post.user_id,
          reason: "Reported from feed",
        });
        toast.success("Thanks — we'll look into it");
      }
      if (kind === "block") {
        await supabase.from("blocks").insert({ blocker_id: meId, blocked_id: post.user_id });
        toast.success(`Blocked @${post.author.username}`);
      }
      if (kind === "delete") {
        await supabase.from("posts").delete().eq("id", post.id);
        toast.success("Post deleted");
      }
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  function like() {
    if (!post.liked) setBurst(true);
    setTimeout(() => setBurst(false), 500);
    toggleLike.mutate();
  }

  async function share() {
    const url = `${window.location.origin}/u/${post.author.username}`;
    try {
      if (navigator.share) await navigator.share({ title: "ChillSnap", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* dismissed */
    }
  }

  return (
    <article className="mb-5 overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3 px-4 py-3">
        <Link to="/u/$username" params={{ username: post.author.username }}>
          <Ava profile={post.author} size={40} ring />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to="/u/$username"
            params={{ username: post.author.username }}
            className="block truncate text-sm font-semibold"
          >
            @{post.author.username}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {post.location ? `${post.location} · ` : ""}
            {timeAgo(post.created_at)}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Post options" className="p-2 text-muted-foreground">
            <MoreHorizontal className="h-5 w-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {post.user_id === meId ? (
              <DropdownMenuItem onClick={() => action.mutate("delete")}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete post
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onClick={() => action.mutate("hide")}>
                  <EyeOff className="mr-2 h-4 w-4" /> Hide post
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => action.mutate("report")}>
                  <Flag className="mr-2 h-4 w-4" /> Report
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => action.mutate("block")}>
                  <Ban className="mr-2 h-4 w-4" /> Block @{post.author.username}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <button
        type="button"
        onDoubleClick={like}
        className="relative block w-full"
        aria-label="Double tap to like"
      >
        {post.media_url ? (
          <Media path={post.media_url} className="aspect-square w-full object-cover" />
        ) : (
          <p className="px-4 py-6 text-left text-lg">{post.caption}</p>
        )}
        {burst && (
          <Heart className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 animate-ping fill-primary text-primary" />
        )}
      </button>

      <div className="flex items-center gap-5 px-4 pt-3">
        <button onClick={like} className="flex items-center gap-1.5 text-sm" aria-label="Like">
          <Heart
            className={cn(
              "h-6 w-6 transition-transform active:scale-125",
              post.liked ? "fill-primary text-primary" : "text-foreground",
            )}
          />
          {post.likes}
        </button>
        <button
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1.5 text-sm"
          aria-label="Comments"
        >
          <MessageCircle className="h-6 w-6" />
          {post.comments}
        </button>
        <button onClick={share} className="ml-auto" aria-label="Share">
          <Send className="h-6 w-6" />
        </button>
      </div>

      {post.caption && (
        <p className="px-4 pt-2 text-sm">
          <span className="font-semibold">@{post.author.username}</span> {post.caption}
        </p>
      )}

      {showComments && (
        <div className="px-4 pb-4 pt-3">
          <div className="space-y-3">
            {comments.data?.map((c) => (
              <div key={c.id} className="flex items-start gap-2">
                <Ava profile={c.author} size={28} />
                <p className="text-sm">
                  <span className="font-semibold">@{c.author?.username}</span> {c.body}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {timeAgo(c.created_at)}
                  </span>
                </p>
              </div>
            ))}
            {comments.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">No comments yet. Be first.</p>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addComment.mutate();
            }}
            className="mt-3 flex gap-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a comment…"
              className="flex-1 rounded-full bg-secondary px-4 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              className="gradient-chill rounded-full px-4 text-sm font-semibold text-primary-foreground"
            >
              Post
            </button>
          </form>
        </div>
      )}
      <div className="pb-1" />
    </article>
  );
}
