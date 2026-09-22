import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Ava } from "@/components/chill/Ava";
import { fetchFriends } from "@/lib/queries";
import { timeAgo, type Profile } from "@/lib/chill";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat — ChillSnap" },
      { name: "description", content: "Disappearing chats that clear themselves after 24 hours." },
      { property: "og:title", content: "Chat — ChillSnap" },
      { property: "og:description", content: "Messages that vanish after a day." },
    ],
  }),
  component: ChatList,
});

function ChatList() {
  const { data: me } = useMe();
  const meId = me?.user.id;

  const chats = useQuery({
    queryKey: ["chats", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select(
          "*, sender:profiles!messages_sender_fkey(*), recipient:profiles!messages_recipient_fkey(*)",
        )
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      const seen = new Map<
        string,
        { other: Profile; body: string; created_at: string; mine: boolean }
      >();
      for (const m of (data ?? []) as Array<{
        sender_id: string;
        body: string;
        created_at: string;
        sender: Profile;
        recipient: Profile;
      }>) {
        const mine = m.sender_id === meId;
        const other = mine ? m.recipient : m.sender;
        if (!other || seen.has(other.id)) continue;
        seen.set(other.id, { other, body: m.body, created_at: m.created_at, mine });
      }
      return [...seen.values()];
    },
  });

  const friends = useQuery({
    queryKey: ["friends", meId],
    enabled: !!meId,
    queryFn: () => fetchFriends(meId!),
  });

  const openIds = new Set(chats.data?.map((c) => c.other.id));

  return (
    <>
      <header className="sticky top-0 z-30 glass flex items-center justify-between px-4 py-3">
        <h1 className="font-display text-2xl font-bold text-gradient">Chat</h1>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Timer className="h-3.5 w-3.5" /> clears in 24h
        </span>
      </header>

      <div className="space-y-2 px-4 py-4">
        {chats.data?.map((c) => (
          <Link
            key={c.other.id}
            to="/chat/$userId"
            params={{ userId: c.other.id }}
            className="flex items-center gap-3 rounded-3xl bg-card px-4 py-3"
          >
            <Ava profile={c.other} size={46} ring />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">@{c.other.username}</p>
              <p className="truncate text-xs text-muted-foreground">
                {c.mine ? "You: " : ""}
                {c.body}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
          </Link>
        ))}
      </div>

      <section className="px-4">
        <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Start a chat
        </h2>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {friends.data
            ?.filter((f) => !openIds.has(f.id))
            .map((f) => (
              <Link
                key={f.id}
                to="/chat/$userId"
                params={{ userId: f.id }}
                className="flex w-16 flex-col items-center gap-1.5"
              >
                <Ava profile={f} size={56} />
                <span className="w-16 truncate text-center text-[11px] text-muted-foreground">
                  {f.username}
                </span>
              </Link>
            ))}
        </div>
      </section>
    </>
  );
}
