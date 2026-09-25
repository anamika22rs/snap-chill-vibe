import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Ava } from "@/components/chill/Ava";
import { timeAgo, type Profile } from "@/lib/chill";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({
    meta: [
      { title: "Chats — ChillSnap" },
      { name: "description", content: "Your private one-to-one ChillSnap conversations." },
      { property: "og:title", content: "Chats — ChillSnap" },
      { property: "og:description", content: "Private one-to-one conversations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatList,
});

type Row = {
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  sender: Profile;
  recipient: Profile;
};

function ChatList() {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const chats = useQuery({
    queryKey: ["chats", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "sender_id, recipient_id, body, created_at, read_at, sender:profiles!messages_sender_fkey(*), recipient:profiles!messages_recipient_fkey(*)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const seen = new Map<string, { other: Profile; body: string; created_at: string; mine: boolean; unread: number }>();
      for (const m of (data ?? []) as unknown as Row[]) {
        const mine = m.sender_id === meId;
        const other = mine ? m.recipient : m.sender;
        if (!other) continue;
        const entry = seen.get(other.id) ?? { other, body: m.body, created_at: m.created_at, mine, unread: 0 };
        if (!mine && !m.read_at) entry.unread++;
        seen.set(other.id, entry);
      }
      return [...seen.values()];
    },
  });

  useEffect(() => {
    if (!meId) return;
    const ch = supabase
      .channel(`chat-list-${meId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () =>
        qc.invalidateQueries({ queryKey: ["chats", meId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [meId, qc]);

  const people = useQuery({
    queryKey: ["chat-search", q],
    enabled: !!meId && q.trim().length > 0,
    queryFn: async () => {
      const term = q.trim().replace(/[%,()]/g, "");
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
        .neq("id", meId!)
        .limit(20);
      return (data ?? []) as Profile[];
    },
  });

  return (
    <>
      <header className="sticky top-0 z-30 glass px-4 py-3">
        <h1 className="font-display text-2xl font-bold text-gradient">Chats</h1>
        <label className="mt-3 flex items-center gap-2 rounded-full bg-card px-4 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find someone to message…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </header>

      {q.trim() ? (
        <div className="space-y-2 px-4 py-4">
          {people.isLoading && <p className="text-center text-sm text-muted-foreground">Searching…</p>}
          {people.data?.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">No users match “{q}”.</p>
          )}
          {people.data?.map((p) => (
            <Link
              key={p.id}
              to="/chat/$userId"
              params={{ userId: p.id }}
              className="flex items-center gap-3 rounded-3xl bg-card px-4 py-3"
            >
              <Ava profile={p} size={42} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">@{p.username}</p>
                {p.status && <p className="truncate text-xs text-muted-foreground">{p.status}</p>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="space-y-2 px-4 py-4">
          {chats.isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading chats…</p>}
          {chats.isError && <p className="py-10 text-center text-sm text-destructive">Couldn't load chats.</p>}
          {chats.data?.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No conversations yet. Search for someone above to start one.
            </p>
          )}
          {chats.data?.map((c) => (
            <Link
              key={c.other.id}
              to="/chat/$userId"
              params={{ userId: c.other.id }}
              className="flex items-center gap-3 rounded-3xl bg-card px-4 py-3"
            >
              <Ava profile={c.other} size={46} ring={c.unread > 0} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">@{c.other.username}</p>
                <p className={`truncate text-xs ${c.unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                  {c.mine ? "You: " : ""}
                  {c.body}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
                {c.unread > 0 && (
                  <span className="gradient-chill flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-primary-foreground">
                    {c.unread > 9 ? "9+" : c.unread}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
