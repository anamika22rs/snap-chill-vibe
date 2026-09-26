import { useBack } from "@/hooks/useBack";
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Phone, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Ava } from "@/components/chill/Ava";
import { useCall } from "@/components/chill/CallProvider";
import { timeAgo, type Profile } from "@/lib/chill";

export const Route = createFileRoute("/_authenticated/chat/$userId")({
  head: () => ({
    meta: [
      { title: "Conversation — ChillSnap" },
      { name: "description", content: "A private one-to-one ChillSnap conversation." },
      { property: "og:title", content: "Conversation — ChillSnap" },
      { property: "og:description", content: "A private one-to-one ChillSnap conversation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  read_at: string | null;
};

function Thread() {
  const { userId } = Route.useParams();
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();
  const { startCall } = useCall();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const other = useQuery({
    queryKey: ["profile-by-id", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data as Profile | null;
    },
  });

  const blockedByMe = useQuery({
    queryKey: ["blocked", meId, userId],
    enabled: !!meId,
    queryFn: async () => {
      const { data } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", meId!).eq("blocked_id", userId).maybeSingle();
      return !!data;
    },
  });
  const isBlocked = blockedByMe.data === true || (other.isSuccess && !other.data);

  const messages = useQuery({
    queryKey: ["thread", meId, userId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, recipient_id, body, created_at, read_at")
        .or(
          `and(sender_id.eq.${meId},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${meId})`,
        )
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  useEffect(() => {
    if (!meId) return;
    const channel = supabase
      .channel(`thread-${meId}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["thread", meId, userId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, meId, userId]);

  // Mark incoming messages read
  const unreadCount = messages.data?.filter((m) => m.recipient_id === meId && !m.read_at).length ?? 0;
  useEffect(() => {
    if (!meId || unreadCount === 0) return;
    void supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", meId)
      .eq("sender_id", userId)
      .is("read_at", null)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["chats", meId] });
        qc.invalidateQueries({ queryKey: ["unread-chats", meId] });
      });
  }, [meId, userId, unreadCount, qc]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data?.length]);

  const send = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase
        .from("messages")
        .insert({ sender_id: meId!, recipient_id: userId, body });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["thread", meId, userId] }),
    onError: (_e, body) => {
      setDraft(body);
      toast.error("Message not sent — you may be blocked or offline");
    },
  });

  const back = useBack("/activity");
  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col">
      <header className="sticky top-0 z-30 glass flex items-center gap-3 px-4 py-3">
        <button onClick={back} aria-label="Back to chats">
          <ArrowLeft className="h-5 w-5" />
        </button>
        {other.data && (
          <Link to="/u/$username" params={{ username: other.data.username }}>
            <Ava profile={other.data} size={38} ring />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">@{other.data?.username ?? "…"}</p>
          {other.data?.status && (
            <p className="truncate text-[11px] text-muted-foreground">{other.data.status}</p>
          )}
        </div>
        <button
          onClick={() => other.data && startCall(other.data)}
          disabled={!other.data || isBlocked}
          aria-label="Voice call"
          className="gradient-chill flex h-10 w-10 items-center justify-center rounded-full text-primary-foreground disabled:opacity-50"
        >
          <Phone className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-2 px-4 py-4">
        {messages.isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
        {messages.isError && <p className="py-10 text-center text-sm text-destructive">Couldn't load messages.</p>}
        {messages.data?.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet. Say hi 👋
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
                <span className="whitespace-pre-wrap break-words">{m.body}</span>
                <span className="mt-1 block text-[10px] opacity-70">
                  {timeAgo(m.created_at)}
                  {mine && (m.read_at ? " · Seen" : " · Sent")}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {isBlocked ? (
        <p className="sticky bottom-24 mx-4 rounded-3xl bg-card px-4 py-3 text-center text-sm text-muted-foreground">
          {blockedByMe.data
            ? "You blocked this account. Unblock them in Settings → Blocked accounts to chat."
            : "You can't message this account."}
        </p>
      ) : (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const body = draft.trim();
          if (!body || !meId) return;
          setDraft("");
          send.mutate(body);
        }}
        className="sticky bottom-24 mx-4 flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message…"
          maxLength={2000}
          className="glass flex-1 rounded-full px-5 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={send.isPending || !draft.trim()}
          className="gradient-chill flex h-12 w-12 items-center justify-center rounded-full text-primary-foreground disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
      )}
    </div>
  );
}
