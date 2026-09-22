import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Ava } from "@/components/chill/Ava";
import { timeLeft, type Profile } from "@/lib/chill";

export const Route = createFileRoute("/_authenticated/chat/$userId")({
  head: () => ({
    meta: [
      { title: "Chat — ChillSnap" },
      { name: "description", content: "A disappearing ChillSnap conversation." },
      { property: "og:title", content: "Chat — ChillSnap" },
      { property: "og:description", content: "A disappearing ChillSnap conversation." },
    ],
  }),
  component: Thread,
});

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  expires_at: string;
};

function Thread() {
  const { userId } = Route.useParams();
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const other = useQuery({
    queryKey: ["profile-by-id", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data as Profile | null;
    },
  });

  const messages = useQuery({
    queryKey: ["thread", meId, userId],
    enabled: !!meId,
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .gt("expires_at", new Date().toISOString())
        .or(
          `and(sender_id.eq.${meId},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${meId})`,
        )
        .order("created_at");
      return (data ?? []) as Message[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`thread-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["thread", meId, userId] });
        qc.invalidateQueries({ queryKey: ["chats", meId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, meId, userId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data?.length]);

  const send = useMutation({
    mutationFn: async () => {
      const body = draft.trim();
      if (!body || !meId) return;
      setDraft("");
      const { error } = await supabase
        .from("messages")
        .insert({ sender_id: meId, recipient_id: userId, body });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["thread", meId, userId] }),
  });

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col">
      <header className="sticky top-0 z-30 glass flex items-center gap-3 px-4 py-3">
        <Link to="/chat" aria-label="Back to chats">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Link to="/u/$username" params={{ username: other.data?.username ?? "" }}>
          <Ava profile={other.data} size={38} ring />
        </Link>
        <div className="flex-1">
          <p className="text-sm font-semibold">@{other.data?.username ?? "…"}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Timer className="h-3 w-3" /> messages disappear in 24h
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-2 px-4 py-4">
        {messages.data?.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Say something — it vanishes tomorrow anyway.
          </p>
        )}
        {messages.data?.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  mine
                    ? "gradient-chill max-w-[78%] rounded-3xl rounded-br-md px-4 py-2.5 text-sm text-primary-foreground"
                    : "max-w-[78%] rounded-3xl rounded-bl-md bg-card px-4 py-2.5 text-sm"
                }
              >
                {m.body}
                <span className="mt-1 block text-[10px] opacity-70">{timeLeft(m.expires_at)}</span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
        className="sticky bottom-24 mx-4 flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Send a disappearing message…"
          className="glass flex-1 rounded-full px-5 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          className="gradient-chill flex h-12 w-12 items-center justify-center rounded-full text-primary-foreground"
          aria-label="Send"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
