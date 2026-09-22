import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Ava } from "@/components/chill/Ava";
import { Media } from "@/components/chill/Media";
import { fetchPosts } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reels")({
  head: () => ({
    meta: [
      { title: "Reels — ChillSnap" },
      { name: "description", content: "Endless vertical reels from the people you follow." },
      { property: "og:title", content: "Reels — ChillSnap" },
      { property: "og:description", content: "Endless vertical reels from your crew." },
    ],
  }),
  component: ReelsPage,
});

function ReelsPage() {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();

  const reels = useQuery({
    queryKey: ["feed", "reel", meId],
    enabled: !!meId,
    queryFn: () => fetchPosts("reel", meId!),
  });

  const like = useMutation({
    mutationFn: async ({ id, liked }: { id: string; liked: boolean }) => {
      if (liked) await supabase.from("post_likes").delete().eq("post_id", id).eq("user_id", meId!);
      else await supabase.from("post_likes").insert({ post_id: id, user_id: meId! });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed"] }),
  });

  return (
    <div className="h-[calc(100vh-7rem)] snap-y snap-mandatory overflow-y-auto">
      {reels.data?.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="font-display text-xl font-bold text-gradient">No reels yet</p>
          <p className="text-sm text-muted-foreground">
            Share a photo as a reel from the feed composer and it shows up here.
          </p>
        </div>
      )}
      {reels.data?.map((r) => (
        <section key={r.id} className="relative h-full w-full snap-start overflow-hidden">
          <Media path={r.media_url} className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/60 to-transparent p-5 pb-8">
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <Link
                  to="/u/$username"
                  params={{ username: r.author.username }}
                  className="flex items-center gap-2"
                >
                  <Ava profile={r.author} size={36} ring />
                  <span className="text-sm font-semibold">@{r.author.username}</span>
                </Link>
                {r.caption && <p className="mt-2 line-clamp-2 text-sm">{r.caption}</p>}
              </div>
              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={() => like.mutate({ id: r.id, liked: r.liked })}
                  className="flex flex-col items-center text-xs"
                  aria-label="Like reel"
                >
                  <Heart className={cn("h-7 w-7", r.liked && "fill-primary text-primary")} />
                  {r.likes}
                </button>
                <Link
                  to="/feed"
                  className="flex flex-col items-center text-xs"
                  aria-label="Comments"
                >
                  <MessageCircle className="h-7 w-7" />
                  {r.comments}
                </Link>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/u/${r.author.username}`,
                    );
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
  );
}
