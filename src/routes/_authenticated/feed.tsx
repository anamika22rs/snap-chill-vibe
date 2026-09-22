import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { TopBar } from "@/components/chill/TopBar";
import { Ava } from "@/components/chill/Ava";
import { Media } from "@/components/chill/Media";
import { Uploader } from "@/components/chill/Uploader";
import { PostCard } from "@/components/chill/PostCard";
import { fetchPosts, fetchStories, type StoryGroup } from "@/lib/queries";
import { timeLeft, uploadMedia } from "@/lib/chill";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({
    meta: [
      { title: "Feed — ChillSnap" },
      { name: "description", content: "Your ChillSnap feed: stories on top, posts below." },
      { property: "og:title", content: "Feed — ChillSnap" },
      { property: "og:description", content: "Stories on top, posts below." },
    ],
  }),
  component: FeedPage,
});

function FeedPage() {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<StoryGroup | null>(null);
  const [composer, setComposer] = useState<{ file: File; preview: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [kind, setKind] = useState<"post" | "reel">("post");

  const stories = useQuery({ queryKey: ["stories"], queryFn: fetchStories });
  const posts = useQuery({
    queryKey: ["feed", "post", meId],
    enabled: !!meId,
    queryFn: () => fetchPosts("post", meId!),
  });

  const addStory = useMutation({
    mutationFn: async (file: File) => {
      const path = await uploadMedia(file, meId!);
      const { error } = await supabase.from("stories").insert({ user_id: meId!, media_url: path });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Story is live for 24 hours 🔥");
      qc.invalidateQueries({ queryKey: ["stories"] });
    },
    onError: () => toast.error("Couldn't upload that one"),
  });

  const createPost = useMutation({
    mutationFn: async () => {
      if (!composer) return;
      const path = await uploadMedia(composer.file, meId!);
      const { error } = await supabase.from("posts").insert({
        user_id: meId!,
        media_url: path,
        caption: caption.trim() || null,
        kind,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setComposer(null);
      setCaption("");
      toast.success(kind === "reel" ? "Reel posted" : "Posted");
      qc.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: () => toast.error("Couldn't post that"),
  });

  const myStories = stories.data?.find((g) => g.author.id === meId);
  const otherStories = (stories.data ?? []).filter((g) => g.author.id !== meId);

  return (
    <>
      <TopBar />

      {/* Stories */}
      <div className="flex gap-4 overflow-x-auto px-4 py-4">
        <div className="flex w-16 flex-col items-center gap-1.5">
          <div className="relative">
            {myStories ? (
              <button onClick={() => setViewing(myStories)} aria-label="Your story">
                <Ava profile={me?.profile} size={64} ring />
              </button>
            ) : (
              <Ava profile={me?.profile} size={64} />
            )}
            <Uploader
              onPick={(file) => addStory.mutate(file)}
              className="gradient-chill absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
            </Uploader>
          </div>
          <span className="truncate text-[11px] text-muted-foreground">Your story</span>
        </div>

        {otherStories.map((g) => (
          <button
            key={g.author.id}
            onClick={() => setViewing(g)}
            className="flex w-16 flex-col items-center gap-1.5"
          >
            <Ava profile={g.author} size={64} ring />
            <span className="w-16 truncate text-[11px] text-muted-foreground">
              {g.author.username}
            </span>
          </button>
        ))}
      </div>

      {/* Composer trigger */}
      <div className="px-4 pb-4">
        <Uploader
          onPick={(file, preview) => setComposer({ file, preview })}
          className="glass flex w-full items-center gap-3 rounded-3xl px-4 py-3 text-left"
        >
          <ImagePlus className="h-5 w-5 text-primary" />
          <span className="text-sm text-muted-foreground">Share a post or reel…</span>
        </Uploader>
      </div>

      <div className="px-4">
        {posts.isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading the vibes…</p>}
        {posts.data?.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nothing here yet. Post something or follow a few people.
          </p>
        )}
        {meId && posts.data?.map((p) => <PostCard key={p.id} post={p} meId={meId} />)}
      </div>

      {/* Story viewer */}
      {viewing && <StoryViewer group={viewing} onClose={() => setViewing(null)} />}

      {/* Post composer sheet */}
      {composer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between px-4 py-4">
            <button onClick={() => setComposer(null)} aria-label="Cancel">
              <X className="h-6 w-6" />
            </button>
            <p className="font-display font-bold">New {kind}</p>
            <button
              onClick={() => createPost.mutate()}
              disabled={createPost.isPending}
              className="text-sm font-semibold text-primary disabled:opacity-50"
            >
              {createPost.isPending ? "Posting…" : "Share"}
            </button>
          </div>
          <img src={composer.preview} alt="" className="aspect-square w-full object-cover" />
          <div className="flex gap-2 px-4 py-4">
            {(["post", "reel"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={
                  k === kind
                    ? "gradient-chill rounded-full px-4 py-2 text-xs font-bold text-primary-foreground"
                    : "rounded-full bg-secondary px-4 py-2 text-xs font-semibold"
                }
              >
                {k === "post" ? "Feed post" : "Reel"}
              </button>
            ))}
          </div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write a caption…"
            className="mx-4 h-24 rounded-2xl bg-card p-4 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      )}
    </>
  );
}

function StoryViewer({ group, onClose }: { group: StoryGroup; onClose: () => void }) {
  const [i, setI] = useState(0);
  const story = group.stories[i];
  if (!story) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-2 px-4 pt-4">
        {group.stories.map((s, idx) => (
          <span
            key={s.id}
            className={`h-1 flex-1 rounded-full ${idx <= i ? "gradient-chill" : "bg-secondary"}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <Ava profile={group.author} size={36} />
        <div className="flex-1">
          <p className="text-sm font-semibold">@{group.author.username}</p>
          <p className="text-xs text-muted-foreground">{timeLeft(story.expires_at)}</p>
        </div>
        <button onClick={onClose} aria-label="Close story">
          <X className="h-6 w-6" />
        </button>
      </div>
      <button
        className="relative flex-1"
        onClick={() => (i + 1 < group.stories.length ? setI(i + 1) : onClose())}
      >
        <Media path={story.media_url} className="h-full w-full object-contain" />
        {story.caption && (
          <p className="glass absolute inset-x-6 bottom-10 rounded-2xl p-3 text-sm">
            {story.caption}
          </p>
        )}
      </button>
    </div>
  );
}
