import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Sparkles, X, Send, Flame, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Ava } from "@/components/chill/Ava";
import { Media } from "@/components/chill/Media";
import { Uploader } from "@/components/chill/Uploader";
import { fetchFriends } from "@/lib/queries";
import { SNAP_FILTERS, filterClass, timeLeft, uploadMedia, type Profile } from "@/lib/chill";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/snap")({
  head: () => ({
    meta: [
      { title: "Snaps — ChillSnap" },
      {
        name: "description",
        content: "Send filtered snaps that disappear in 24 hours and keep your streaks alive.",
      },
      { property: "og:title", content: "Snaps — ChillSnap" },
      { property: "og:description", content: "Disappearing snaps, filters and fire streaks." },
    ],
  }),
  component: SnapPage,
});

type SnapRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  media_url: string | null;
  caption: string | null;
  filter: string | null;
  opened_at: string | null;
  expires_at: string;
  created_at: string;
  sender: Profile;
};

function SnapPage() {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();
  const [draft, setDraft] = useState<{ file: File; preview: string } | null>(null);
  const [filter, setFilter] = useState<string>("none");
  const [caption, setCaption] = useState("");
  const [picking, setPicking] = useState(false);
  const [opening, setOpening] = useState<SnapRow | null>(null);

  const inbox = useQuery({
    queryKey: ["snaps", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data } = await supabase
        .from("snaps")
        .select("*, sender:profiles!snaps_sender_fkey(*)")
        .eq("recipient_id", meId!)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      return (data ?? []) as SnapRow[];
    },
  });

  const streaks = useQuery({
    queryKey: ["streaks", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data } = await supabase.from("streaks").select("*");
      const rows = (data ?? []) as Array<{
        user_a: string;
        user_b: string;
        count: number;
        last_snap_at: string;
      }>;
      const otherIds = rows.map((r) => (r.user_a === meId ? r.user_b : r.user_a));
      if (otherIds.length === 0) return [];
      const { data: profiles } = await supabase.from("profiles").select("*").in("id", otherIds);
      return rows
        .map((r) => ({
          ...r,
          other: (profiles ?? []).find(
            (p) => p.id === (r.user_a === meId ? r.user_b : r.user_a),
          ) as Profile | undefined,
        }))
        .filter((r) => r.other && r.count > 0)
        .sort((a, b) => b.count - a.count);
    },
  });

  const friends = useQuery({
    queryKey: ["friends", meId],
    enabled: !!meId && picking,
    queryFn: () => fetchFriends(meId!),
  });

  const send = useMutation({
    mutationFn: async (recipientIds: string[]) => {
      if (!draft) return;
      const path = await uploadMedia(draft.file, meId!);
      const rows = recipientIds.map((rid) => ({
        sender_id: meId!,
        recipient_id: rid,
        media_url: path,
        caption: caption.trim() || null,
        filter,
      }));
      const { error } = await supabase.from("snaps").insert(rows);
      if (error) throw error;
      await supabase
        .from("profiles")
        .update({ snap_score: (me?.profile?.snap_score ?? 0) + rows.length })
        .eq("id", meId!);
    },
    onSuccess: () => {
      setDraft(null);
      setPicking(false);
      setCaption("");
      toast.success("Snap sent 🔥");
      qc.invalidateQueries();
    },
    onError: () => toast.error("Couldn't send that snap"),
  });

  async function openSnap(snap: SnapRow) {
    setOpening(snap);
    if (!snap.opened_at) {
      await supabase
        .from("snaps")
        .update({ opened_at: new Date().toISOString() })
        .eq("id", snap.id);
      qc.invalidateQueries({ queryKey: ["snaps", meId] });
    }
  }

  return (
    <>
      <header className="sticky top-0 z-30 glass flex items-center justify-between px-4 py-3">
        <h1 className="font-display text-2xl font-bold text-gradient">Snaps</h1>
        <span className="text-xs text-muted-foreground">
          Snap score {me?.profile?.snap_score ?? 0}
        </span>
      </header>

      <div className="px-4 py-4">
        <Uploader
          capture
          onPick={(file, preview) => {
            setDraft({ file, preview });
            setFilter("none");
          }}
          className="gradient-chill glow flex h-32 w-full flex-col items-center justify-center gap-2 rounded-3xl text-primary-foreground"
        >
          <Camera className="h-9 w-9" />
          <span className="font-display text-lg font-bold">Take a snap</span>
        </Uploader>
      </div>

      {/* Streaks */}
      <section className="px-4 pb-4">
        <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Streaks
        </h2>
        {streaks.data?.length ? (
          <div className="flex gap-3 overflow-x-auto">
            {streaks.data.map((s) => (
              <div
                key={`${s.user_a}-${s.user_b}`}
                className="flex w-20 flex-col items-center gap-1.5"
              >
                <Ava profile={s.other} size={56} ring />
                <span className="flex items-center gap-1 text-xs font-bold">
                  <Flame className="h-3.5 w-3.5 text-flame" />
                  {s.count} 🔥
                </span>
                <span className="w-20 truncate text-center text-[11px] text-muted-foreground">
                  {s.other?.username}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Send a snap two days in a row to start a fire streak.
          </p>
        )}
      </section>

      {/* Inbox */}
      <section className="px-4">
        <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
          For you
        </h2>
        <div className="space-y-2">
          {inbox.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No snaps waiting. Send one first.</p>
          )}
          {inbox.data?.map((s) => (
            <button
              key={s.id}
              onClick={() => openSnap(s)}
              className="flex w-full items-center gap-3 rounded-3xl bg-card px-4 py-3 text-left"
            >
              <Ava profile={s.sender} size={44} ring={!s.opened_at} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">@{s.sender?.username}</p>
                <p className="text-xs text-muted-foreground">
                  {s.opened_at ? "Opened" : "New snap"} · {timeLeft(s.expires_at)}
                </p>
              </div>
              {s.opened_at ? (
                <Eye className="h-5 w-5 text-muted-foreground" />
              ) : (
                <span className="gradient-chill h-3 w-3 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Snap editor */}
      {draft && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="relative flex-1 overflow-hidden">
            <img
              src={draft.preview}
              alt=""
              className={cn("h-full w-full object-cover", filterClass(filter))}
            />
            <button
              onClick={() => setDraft(null)}
              className="glass absolute left-4 top-4 rounded-full p-2"
              aria-label="Discard snap"
            >
              <X className="h-5 w-5" />
            </button>
            {caption && (
              <p className="glass absolute inset-x-6 top-1/2 rounded-xl p-3 text-center text-sm">
                {caption}
              </p>
            )}
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2 overflow-x-auto">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              {SNAP_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={
                    filter === f.id
                      ? "gradient-chill shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-primary-foreground"
                      : "shrink-0 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold"
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption…"
              className="w-full rounded-2xl bg-card px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={() => setPicking(true)}
              className="gradient-chill flex h-14 w-full items-center justify-center gap-2 rounded-full font-display text-lg font-bold text-primary-foreground"
            >
              <Send className="h-5 w-5" /> Send to…
            </button>
          </div>
        </div>
      )}

      {/* Recipient picker */}
      {picking && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background/95 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-display text-lg font-bold">Send to</p>
            <button onClick={() => setPicking(false)} aria-label="Close">
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto">
            {friends.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nobody to snap yet — find people in Discover.
              </p>
            )}
            {friends.data?.map((f) => (
              <button
                key={f.id}
                onClick={() => send.mutate([f.id])}
                disabled={send.isPending}
                className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left disabled:opacity-60"
              >
                <Ava profile={f} size={40} />
                <span className="text-sm font-semibold">@{f.username}</span>
                <Send className="ml-auto h-4 w-4 text-primary" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Snap viewer */}
      {opening && (
        <button
          className="fixed inset-0 z-[70] bg-background"
          onClick={() => setOpening(null)}
          aria-label="Close snap"
        >
          <Media
            path={opening.media_url}
            className="h-full w-full object-contain"
            filterClassName={filterClass(opening.filter)}
          />
          {opening.caption && (
            <p className="glass absolute inset-x-6 top-1/2 rounded-xl p-3 text-center text-sm">
              {opening.caption}
            </p>
          )}
          <p className="absolute inset-x-0 bottom-6 text-center text-xs text-muted-foreground">
            Tap anywhere to close · {timeLeft(opening.expires_at)}
          </p>
        </button>
      )}
    </>
  );
}
