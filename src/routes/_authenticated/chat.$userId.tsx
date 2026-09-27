import { useBack } from "@/hooks/useBack";
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MoreVertical, Pencil, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Ava } from "@/components/chill/Ava";
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
  edited_at: string | null;
  deleted_at: string | null;
};

type Confirm = { msg: Message; kind: "me" | "everyone" } | null;

function Thread() {
  const { userId } = Route.useParams();
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const key = ["thread", meId, userId];
  const messages = useQuery({
    queryKey: key,
    enabled: !!meId,
    queryFn: async () => {
      const [{ data, error }, { data: hides }] = await Promise.all([
        supabase
          .from("messages")
          .select("id, sender_id, recipient_id, body, created_at, read_at, edited_at, deleted_at")
          .or(
            `and(sender_id.eq.${meId},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${meId})`,
          )
          .order("created_at"),
        supabase.from("message_hides").select("message_id").eq("user_id", meId!),
      ]);
      if (error) throw error;
      const hidden = new Set((hides ?? []).map((h) => h.message_id));
      return ((data ?? []) as Message[]).filter((m) => !hidden.has(m.id));
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

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["chats", meId] });
  };

  const send = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from("messages").insert({ sender_id: meId!, recipient_id: userId, body });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (_e, body) => {
      setDraft(body);
      toast.error("Message not sent — you may be blocked or offline");
    },
  });

  const edit = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { error } = await supabase.from("messages").update({ body }).eq("id", id).eq("sender_id", meId!);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(null);
      setDraft("");
      refresh();
    },
    onError: () => toast.error("Couldn't edit the message"),
  });

  const remove = useMutation({
    mutationFn: async ({ msg, kind }: { msg: Message; kind: "me" | "everyone" }) => {
      if (kind === "everyone") {
        const { error } = await supabase
          .from("messages")
          .update({ deleted_at: new Date().toISOString(), body: "" })
          .eq("id", msg.id)
          .eq("sender_id", meId!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("message_hides").insert({ user_id: meId!, message_id: msg.id });
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      toast.success(v.kind === "everyone" ? "Deleted for everyone" : "Deleted for you");
      setConfirm(null);
      refresh();
    },
    onError: () => toast.error("Couldn't delete the message"),
  });

  function startPress(m: Message) {
    pressTimer.current = setTimeout(() => setMenu(m), 450);
  }
  function endPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }

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
          {other.data?.status && <p className="truncate text-[11px] text-muted-foreground">{other.data.status}</p>}
        </div>
      </header>

      <div className="flex-1 space-y-2 px-4 py-4">
        {messages.isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
        {messages.isError && <p className="py-10 text-center text-sm text-destructive">Couldn't load messages.</p>}
        {messages.data?.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Say hi 👋</p>
        )}
        {messages.data?.map((m) => {
          const mine = m.sender_id === meId;
          const deleted = !!m.deleted_at;
          return (
            <div key={m.id} className={`group flex items-center gap-1 ${mine ? "justify-end" : "justify-start"}`}>
              {mine && (
                <button
                  onClick={() => setMenu(m)}
                  aria-label="Message options"
                  className="rounded-full p-1 text-muted-foreground opacity-60 hover:opacity-100"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              )}
              <div
                onTouchStart={() => startPress(m)}
                onTouchEnd={endPress}
                onTouchMove={endPress}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu(m);
                }}
                className={`select-none ${
                  mine
                    ? "gradient-chill max-w-[78%] rounded-3xl rounded-br-md px-4 py-2.5 text-sm text-primary-foreground"
                    : "max-w-[78%] rounded-3xl rounded-bl-md bg-card px-4 py-2.5 text-sm"
                } ${deleted ? "opacity-60" : ""}`}
              >
                {deleted ? (
                  <span className="italic">Message deleted</span>
                ) : (
                  <span className="whitespace-pre-wrap break-words">{m.body}</span>
                )}
                <span className="mt-1 block text-[10px] opacity-70">
                  {timeAgo(m.created_at)}
                  {m.edited_at && !deleted && " · edited"}
                  {mine && !deleted && (m.read_at ? " · Seen" : " · Sent")}
                </span>
              </div>
              {!mine && (
                <button
                  onClick={() => setMenu(m)}
                  aria-label="Message options"
                  className="rounded-full p-1 text-muted-foreground opacity-60 hover:opacity-100"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              )}
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
        <div className="sticky bottom-24 mx-4">
          {editing && (
            <div className="mb-2 flex items-center justify-between rounded-2xl bg-card px-4 py-2 text-xs">
              <span className="font-semibold text-primary">Editing message</span>
              <button
                onClick={() => {
                  setEditing(null);
                  setDraft("");
                }}
                aria-label="Cancel edit"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const body = draft.trim();
              if (!body || !meId) return;
              if (editing) {
                if (body !== editing.body) edit.mutate({ id: editing.id, body });
                else setEditing(null);
                return;
              }
              setDraft("");
              send.mutate(body);
            }}
            className="flex gap-2"
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
              disabled={send.isPending || edit.isPending || !draft.trim()}
              className="gradient-chill flex h-12 w-12 items-center justify-center rounded-full text-primary-foreground disabled:opacity-50"
              aria-label={editing ? "Save edit" : "Send"}
            >
              {editing ? <Pencil className="h-5 w-5" /> : <Send className="h-5 w-5" />}
            </button>
          </form>
        </div>
      )}

      {menu && (
        <Sheet onClose={() => setMenu(null)}>
          {menu.sender_id === meId && !menu.deleted_at && (
            <SheetBtn
              icon={<Pencil className="h-4 w-4" />}
              label="Edit"
              onClick={() => {
                setEditing(menu);
                setDraft(menu.body);
                setMenu(null);
              }}
            />
          )}
          <SheetBtn
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete for me"
            onClick={() => {
              setConfirm({ msg: menu, kind: "me" });
              setMenu(null);
            }}
          />
          {menu.sender_id === meId && !menu.deleted_at && (
            <SheetBtn
              danger
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete for everyone"
              onClick={() => {
                setConfirm({ msg: menu, kind: "everyone" });
                setMenu(null);
              }}
            />
          )}
        </Sheet>
      )}

      {confirm && (
        <Sheet onClose={() => setConfirm(null)}>
          <p className="px-2 pb-3 text-center text-sm">
            {confirm.kind === "everyone"
              ? "Delete this message for everyone? Nobody will be able to see it."
              : "Delete this message for you? The other person will still see it."}
          </p>
          <SheetBtn
            danger
            icon={<Trash2 className="h-4 w-4" />}
            label={remove.isPending ? "Deleting…" : "Delete"}
            onClick={() => remove.mutate(confirm)}
          />
          <SheetBtn icon={<X className="h-4 w-4" />} label="Cancel" onClick={() => setConfirm(null)} />
        </Sheet>
      )}
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-background/70" onClick={onClose}>
      <div
        className="w-full max-w-lg space-y-2 rounded-t-3xl bg-card p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function SheetBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl bg-secondary px-4 py-3.5 text-sm font-semibold ${danger ? "text-destructive" : ""}`}
    >
      {icon} {label}
    </button>
  );
}
