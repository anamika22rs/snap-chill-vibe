import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, UserPlus, Check, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Ava } from "@/components/chill/Ava";
import { timeAgo, type Profile } from "@/lib/chill";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity — ChillSnap" },
      { name: "description", content: "Likes, comments, follows and calls from your people." },
      { property: "og:title", content: "Activity — ChillSnap" },
      { property: "og:description", content: "Likes, comments, follows and calls." },
    ],
  }),
  component: ActivityPage,
});

type Notif = {
  id: string;
  type: string;
  post_id: string | null;
  read_at: string | null;
  created_at: string;
  actor: Profile | null;
};

function ActivityPage() {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();

  const notifs = useQuery({
    queryKey: ["notifications", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*, actor:profiles!notifications_actor_profile_fkey(*)")
        .eq("user_id", meId!)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as unknown as Notif[];
    },
  });

  const calls = useQuery({
    queryKey: ["call-log", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data } = await supabase
        .from("calls")
        .select("*, caller:profiles!calls_caller_profile_fkey(*), callee:profiles!calls_callee_profile_fkey(*)")
        .order("created_at", { ascending: false })
        .limit(15);
      return (data ?? []) as unknown as Array<{
        id: string;
        caller_id: string;
        status: string;
        created_at: string;
        caller: Profile | null;
        callee: Profile | null;
      }>;
    },
  });

  const pending = useQuery({
    queryKey: ["follow-requests", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data } = await supabase
        .from("follows")
        .select("follower_id, follower:profiles!follows_follower_profile_fkey(*)")
        .eq("following_id", meId!)
        .eq("status", "pending");
      return (data ?? []) as unknown as Array<{ follower_id: string; follower: Profile | null }>;
    },
  });

  const accept = useMutation({
    mutationFn: async (followerId: string) => {
      const { error } = await supabase
        .from("follows")
        .update({ status: "accepted" })
        .eq("follower_id", followerId)
        .eq("following_id", meId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request accepted");
      qc.invalidateQueries({ queryKey: ["follow-requests", meId] });
    },
    onError: () => toast.error("Couldn't accept that request"),
  });

  // Mark everything as read once the screen is open.
  useEffect(() => {
    if (!meId || !notifs.data?.some((n) => !n.read_at)) return;
    void supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", meId)
      .is("read_at", null)
      .then(() => qc.invalidateQueries({ queryKey: ["unread-activity", meId] }));
  }, [meId, notifs.data, qc]);

  const icon = (type: string) =>
    type === "like" ? Heart : type === "comment" || type === "message" ? MessageCircle : UserPlus;

  const text = (type: string) =>
    type === "like"
      ? "liked your post"
      : type === "comment"
        ? "commented on your post"
        : type === "message"
          ? "sent you a message"
          : type === "follow_request"
          ? "asked to follow you"
          : "started following you";

  return (
    <>
      <header className="sticky top-0 z-30 glass px-4 py-3">
        <h1 className="font-display text-2xl font-bold text-gradient">Activity</h1>
      </header>

      {(pending.data?.length ?? 0) > 0 && (
        <section className="px-4 pt-4">
          <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Follow requests
          </h2>
          <div className="space-y-2">
            {pending.data?.map((r) => (
              <div key={r.follower_id} className="flex items-center gap-3 rounded-3xl bg-card px-4 py-3">
                <Ava profile={r.follower} size={42} />
                <p className="flex-1 truncate text-sm font-semibold">@{r.follower?.username}</p>
                <button
                  onClick={() => accept.mutate(r.follower_id)}
                  disabled={accept.isPending}
                  className="gradient-chill flex items-center gap-1 rounded-full px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
                >
                  <Check className="h-3.5 w-3.5" /> Accept
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-2 px-4 py-4">
        {notifs.isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading activity…</p>
        )}
        {notifs.isError && (
          <p className="py-8 text-center text-sm text-destructive">Couldn't load your activity.</p>
        )}
        {notifs.data?.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No activity yet. Likes, comments and new followers show up here.
          </p>
        )}
        {notifs.data?.map((n) => {
          const Icon = icon(n.type);
          return (
            <div
              key={n.id}
              className={`flex items-center gap-3 rounded-3xl px-4 py-3 ${n.read_at ? "bg-card" : "glass"}`}
            >
              {n.actor ? (
                <Link to="/u/$username" params={{ username: n.actor.username }}>
                  <Ava profile={n.actor} size={42} />
                </Link>
              ) : (
                <Ava size={42} />
              )}
              <p className="flex-1 text-sm">
                <span className="font-semibold">@{n.actor?.username ?? "someone"}</span>{" "}
                {text(n.type)}
                <span className="ml-2 text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
              </p>
              <Icon className="h-4 w-4 text-primary" />
            </div>
          );
        })}
      </div>

      {(calls.data?.length ?? 0) > 0 && (
        <section className="px-4 pb-6">
          <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Recent calls
          </h2>
          <div className="space-y-2">
            {calls.data?.map((c) => {
              const outgoing = c.caller_id === meId;
              const other = outgoing ? c.callee : c.caller;
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-3xl bg-card px-4 py-3">
                  <Ava profile={other} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">@{other?.username ?? "unknown"}</p>
                    <p className="text-xs text-muted-foreground">
                      {outgoing ? "Outgoing" : "Incoming"} · {c.status} · {timeAgo(c.created_at)}
                    </p>
                  </div>
                  <Phone className="h-4 w-4 text-muted-foreground" />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
