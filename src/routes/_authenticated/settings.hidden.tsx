import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { useBack } from "@/hooks/useBack";

export const Route = createFileRoute("/_authenticated/settings/hidden")({
  head: () => ({
    meta: [
      { title: "Hidden posts — ChillSnap" },
      { name: "description", content: "Posts you've hidden from your ChillSnap feed." },
      { property: "og:title", content: "Hidden posts — ChillSnap" },
      { property: "og:description", content: "Posts you've hidden from your feed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HiddenPosts,
});

function HiddenPosts() {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();
  const back = useBack("/settings");

  const list = useQuery({
    queryKey: ["hidden-posts", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hidden_posts")
        .select("post_id, created_at, posts(caption)")
        .eq("user_id", meId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const unhide = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from("hidden_posts").delete().eq("user_id", meId!).eq("post_id", postId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Post is back in your feed");
      void qc.invalidateQueries();
    },
    onError: () => toast.error("Couldn't unhide"),
  });

  return (
    <>
      <header className="sticky top-0 z-30 glass flex items-center gap-3 px-4 py-3">
        <button onClick={back} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-display text-xl font-bold">Hidden posts</h1>
      </header>
      <div className="space-y-2 px-4 py-5">
        {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {list.data?.length === 0 && <p className="text-sm text-muted-foreground">You haven't hidden any posts.</p>}
        {list.data?.map((h) => (
          <div key={h.post_id} className="flex items-center gap-3 rounded-3xl bg-card px-4 py-3">
            <p className="flex-1 truncate text-sm">
              {(h.posts as { caption: string | null } | null)?.caption || "Post"}
            </p>
            <button
              onClick={() => unhide.mutate(h.post_id)}
              disabled={unhide.isPending}
              className="flex items-center gap-1 rounded-full bg-secondary px-3 py-2 text-xs font-bold disabled:opacity-60"
            >
              <Eye className="h-3.5 w-3.5" /> Unhide
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
