import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Pause, Play, Plus, Send, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { useHiddenIds } from "@/hooks/useHiddenAccounts";
import { Ava } from "@/components/chill/Ava";
import { Media } from "@/components/chill/Media";
import { fetchPosts } from "@/lib/queries";
import { resolveMedia } from "@/lib/chill";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reels")({
  head: () => ({
    meta: [
      { title: "Reels — ChillSnap" },
      { name: "description", content: "Watch vertical video reels from people on ChillSnap." },
      { property: "og:title", content: "Reels — ChillSnap" },
      { property: "og:description", content: "Vertical video reels from your crew." },
    ],
  }),
  component: ReelsPage,
});

function ReelVideo({ path, muted, onToggleMute }: { path: string; muted: boolean; onToggleMute: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const { data: src } = useQuery({
    queryKey: ["media", path],
    staleTime: 60 * 60 * 1000,
    queryFn: () => resolveMedia(path),
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        if (e.isIntersecting && e.intersectionRatio > 0.6) el.play().catch(() => setPlaying(false));
        else el.pause();
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => toast.error("Couldn't play this video"));
    else el.pause();
  };

  if (!src) return <div className="h-full w-full animate-pulse bg-muted" />;
  if (failed)
    return (
      <div className="flex h-full w-full items-center justify-center bg-card text-sm text-muted-foreground">
        This video can't be played on your device.
      </div>
    );

  return (
    <>
      <video
        ref={ref}
        src={src}
        loop
        playsInline
        muted={muted}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
        onClick={toggle}
        className="h-full w-full bg-background object-contain"
      />
      {!playing && (
        <button
          onClick={toggle}
          aria-label="Play"
          className="glass absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full p-5"
        >
          <Play className="h-8 w-8" />
        </button>
      )}
      <div className="absolute right-3 top-3 flex gap-2">
        <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="glass rounded-full p-2">
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button onClick={onToggleMute} aria-label={muted ? "Unmute" : "Mute"} className="glass rounded-full p-2">
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </div>
    </>
  );
}

function ReelsPage() {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();
  const hiddenIds = useHiddenIds();
  const [muted, setMuted] = useState(true);

  const reels = useQuery({
    queryKey: ["feed", "reel", meId],
    enabled: !!meId,
    queryFn: () => fetchPosts("reel", meId!),
  });
  const visible = (reels.data ?? []).filter((r) => !hiddenIds.has(r.user_id));

  const like = useMutation({
    mutationFn: async ({ id, liked }: { id: string; liked: boolean }) => {
      if (liked) await supabase.from("post_likes").delete().eq("post_id", id).eq("user_id", meId!);
      else await supabase.from("post_likes").insert({ post_id: id, user_id: meId! });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed"] }),
  });

  return (
    <div className="relative">
      <Link
        to="/create"
        search={{ kind: "reel" }}
        className="gradient-chill glow absolute left-3 top-3 z-20 flex items-center gap-1 rounded-full px-4 py-2 text-xs font-bold text-primary-foreground"
      >
        <Plus className="h-4 w-4" /> Create Reel
      </Link>
      <div className="h-[calc(100dvh-7rem)] snap-y snap-mandatory overflow-y-auto">
        {reels.isLoading && <div className="h-full w-full animate-pulse bg-muted" />}
        {reels.isError && (
          <div className="flex h-full items-center justify-center text-sm text-destructive">
            Couldn't load reels. Pull to refresh.
          </div>
        )}
        {reels.isSuccess && visible.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="font-display text-xl font-bold text-gradient">No reels yet</p>
            <p className="text-sm text-muted-foreground">Be the first — upload a video reel.</p>
          </div>
        )}
        {visible.map((r) => (
          <section key={r.id} className="relative h-full w-full snap-start overflow-hidden bg-background">
            {r.media_type === "video" && r.media_url ? (
              <ReelVideo path={r.media_url} muted={muted} onToggleMute={() => setMuted((m) => !m)} />
            ) : (
              <Media path={r.media_url} className="h-full w-full object-cover" />
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/60 to-transparent p-5 pb-8">
              <div className="flex items-end gap-3">
                <div className="pointer-events-auto min-w-0 flex-1">
                  <Link to="/u/$username" params={{ username: r.author.username }} className="flex items-center gap-2">
                    <Ava profile={r.author} size={36} ring />
                    <span className="text-sm font-semibold">@{r.author.username}</span>
                    {r.vibe && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold">{r.vibe}</span>
                    )}
                  </Link>
                  {r.caption && <p className="mt-2 line-clamp-2 text-sm">{r.caption}</p>}
                  {r.hashtags && r.hashtags.length > 0 && (
                    <p className="mt-1 line-clamp-1 text-xs text-primary">
                      {r.hashtags.map((t) => `#${t}`).join(" ")}
                    </p>
                  )}
                </div>
                <div className="pointer-events-auto flex flex-col items-center gap-4">
                  <button
                    onClick={() => like.mutate({ id: r.id, liked: r.liked })}
                    className="flex flex-col items-center text-xs"
                    aria-label="Like reel"
                  >
                    <Heart className={cn("h-7 w-7", r.liked && "fill-primary text-primary")} />
                    {r.likes}
                  </button>
                  <Link to="/feed" className="flex flex-col items-center text-xs" aria-label="Comments">
                    <MessageCircle className="h-7 w-7" />
                    {r.comments}
                  </Link>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(`${window.location.origin}/u/${r.author.username}`);
                      toast.success("Link copied");
                    }}
                    aria-label="Share reel"
                  >
                    <Send className="h-7 w-7" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
