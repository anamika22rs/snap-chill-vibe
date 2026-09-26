import { useBack } from "@/hooks/useBack";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Flag, Lock, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Ava } from "@/components/chill/Ava";
import { Media } from "@/components/chill/Media";
import { FollowButton } from "@/components/chill/FollowButton";
import { useCall } from "@/components/chill/CallProvider";
import type { Post, Profile } from "@/lib/chill";

export const Route = createFileRoute("/_authenticated/u/$username")({
  head: () => ({
    meta: [
      { title: "Profile — ChillSnap" },
      { name: "description", content: "A ChillSnap member's profile, posts and snap score." },
      { property: "og:title", content: "Profile — ChillSnap" },
      { property: "og:description", content: "A ChillSnap member's profile and posts." },
    ],
  }),
  component: UserPage,
});

function UserPage() {
  const { username } = Route.useParams();
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { startCall } = useCall();
  const back = useBack("/search");
  const myBlocks = useQuery({
    queryKey: ["blocks", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data } = await supabase.rpc("my_blocked_accounts" as never);
      return (data ?? []) as unknown as Profile[];
    },
  });
  const unblockHidden = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blocks").delete().eq("blocker_id", meId!).eq("blocked_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Unblocked @${username}`);
      qc.invalidateQueries();
    },
    onError: () => toast.error("Couldn't unblock"),
  });

  const profile = useQuery({
    queryKey: ["profile-by-username", username],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Profile | null;
    },
  });
  const target = profile.data;

  const blocked = useQuery({
    queryKey: ["blocked", meId, target?.id],
    enabled: !!meId && !!target,
    queryFn: async () => {
      const { data } = await supabase
        .from("blocks")
        .select("blocked_id")
        .eq("blocker_id", meId!)
        .eq("blocked_id", target!.id)
        .maybeSingle();
      return !!data;
    },
  });

  const posts = useQuery({
    queryKey: ["user-posts", target?.id],
    enabled: !!target,
    queryFn: async () => {
      const { data } = await supabase
        .from("posts")
        .select("*")
        .eq("user_id", target!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as Post[];
    },
  });

  const toggleBlock = useMutation({
    mutationFn: async () => {
      if (!meId || !target) return;
      if (blocked.data) {
        const { error } = await supabase
          .from("blocks")
          .delete()
          .eq("blocker_id", meId)
          .eq("blocked_id", target.id);
        if (error) throw error;
        toast.success(`Unblocked @${target.username}`);
      } else {
        const { error } = await supabase
          .from("blocks")
          .insert({ blocker_id: meId, blocked_id: target.id });
        if (error) throw error;
        toast.success(`Blocked @${target.username}`);
      }
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: () => toast.error("Couldn't update that"),
  });

  const report = useMutation({
    mutationFn: async () => {
      if (!meId || !target) return;
      const { error } = await supabase.from("reports").insert({
        reporter_id: meId,
        target_user_id: target.id,
        reason: "Reported from profile",
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Thanks — we'll look into it"),
    onError: () => toast.error("Couldn't send that report"),
  });

  if (profile.isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">Loading profile…</p>;
  }
  const blockedByMe = !target
    ? myBlocks.data?.find((p) => p.username.toLowerCase() === username.toLowerCase())
    : undefined;
  if (!target && blockedByMe) {
    return (
      <div className="px-4 py-20 text-center">
        <Ava profile={blockedByMe} size={84} />
        <p className="mt-4 font-display text-lg font-bold">@{blockedByMe.username}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          You blocked this account. Their profile and posts are hidden.
        </p>
        <button
          onClick={() => unblockHidden.mutate(blockedByMe.id)}
          disabled={unblockHidden.isPending}
          className="gradient-chill mt-5 rounded-full px-6 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {unblockHidden.isPending ? "Unblocking…" : "Unblock"}
        </button>
      </div>
    );
  }
  if (!target) {
    return (
      <div className="px-4 py-20 text-center">
        <p className="text-sm text-muted-foreground">No account called @{username}.</p>
        <Link to="/search" className="mt-4 inline-block text-sm font-semibold text-primary">
          Search people
        </Link>
      </div>
    );
  }
  if (meId === target.id) {
    navigate({ to: "/profile", replace: true });
    return null;
  }

  const hiddenByPrivacy = target.is_private && posts.data?.length === 0;

  return (
    <>
      <header className="sticky top-0 z-30 glass flex items-center gap-3 px-4 py-3">
        <button onClick={back} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="font-display text-lg font-bold">@{target.username}</p>
      </header>

      <section className="px-4 py-5">
        <div className="flex items-center gap-4">
          <Ava profile={target} size={84} ring />
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-bold">
              {target.display_name || target.username}
            </p>
            {target.status && <p className="truncate text-sm">{target.status}</p>}
            {target.is_private && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" /> Private account
              </p>
            )}
          </div>
        </div>
        {target.bio && <p className="mt-3 text-sm text-muted-foreground">{target.bio}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <FollowButton target={target} className="px-6 py-2.5" />
          <Link
            to="/chat/$userId"
            params={{ userId: target.id }}
            className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2.5 text-xs font-bold"
          >
            <MessageCircle className="h-4 w-4" /> Message
          </Link>
          <button
            onClick={() => void startCall(target)}
            className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2.5 text-xs font-bold"
          >
            <Phone className="h-4 w-4" /> Call
          </button>
          <button
            onClick={() => toggleBlock.mutate()}
            disabled={toggleBlock.isPending}
            className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2.5 text-xs font-bold disabled:opacity-60"
          >
            <Ban className="h-4 w-4" /> {blocked.data ? "Unblock" : "Block"}
          </button>
          <button
            onClick={() => report.mutate()}
            disabled={report.isPending}
            className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2.5 text-xs font-bold disabled:opacity-60"
          >
            <Flag className="h-4 w-4" /> Report
          </button>
        </div>
      </section>

      <section className="px-4">
        {posts.isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading posts…</p>
        )}
        {hiddenByPrivacy && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            This account is private. Follow to see their posts.
          </p>
        )}
        {!hiddenByPrivacy && posts.data?.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No posts yet.</p>
        )}
        <div className="grid grid-cols-3 gap-1">
          {posts.data?.map((p) =>
            p.media_url ? (
              <Media key={p.id} path={p.media_url} className="aspect-square w-full object-cover" />
            ) : (
              <div
                key={p.id}
                className="flex aspect-square items-center justify-center rounded-sm bg-card p-2 text-[10px] text-muted-foreground"
              >
                {p.caption?.slice(0, 60)}
              </div>
            ),
          )}
        </div>
      </section>
    </>
  );
}
