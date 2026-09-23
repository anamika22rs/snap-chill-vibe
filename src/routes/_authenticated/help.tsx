import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { timeAgo } from "@/lib/chill";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({
    meta: [
      { title: "Help & Support — ChillSnap" },
      { name: "description", content: "ChillSnap FAQ and a form to report a problem." },
      { property: "og:title", content: "Help & Support — ChillSnap" },
      { property: "og:description", content: "ChillSnap FAQ and a form to report a problem." },
    ],
  }),
  component: HelpPage,
});

const faqs = [
  {
    q: "How long do snaps and stories last?",
    a: "Snaps and stories disappear 24 hours after you send or post them. Chat messages are kept so you always have your history.",
  },
  {
    q: "How do streaks work?",
    a: "Send a snap to the same person at least once a day. Miss more than 48 hours and the streak resets to 1.",
  },
  {
    q: "What does a private account change?",
    a: "With a private account, only people whose follow request you accept can see your posts, stories and location.",
  },
  {
    q: "How do I block or unblock someone?",
    a: "Open their profile and tap Block. You can unblock anyone from Settings under Blocked accounts.",
  },
  {
    q: "Who can call me?",
    a: "Anyone you haven't blocked can start a voice call. Your browser will ask for microphone permission the first time.",
  },
  {
    q: "Can I change my username?",
    a: "Yes — open Profile, tap Edit profile and save. Usernames are unique, so you'll be told if one is taken.",
  },
];

function HelpPage() {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState<number | null>(0);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const tickets = useQuery({
    queryKey: ["tickets", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as Array<{
        id: string;
        subject: string;
        status: string;
        created_at: string;
      }>;
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!subject.trim() || !body.trim()) throw new Error("Add a subject and a description");
      const { error } = await supabase
        .from("support_tickets")
        .insert({ user_id: meId!, subject: subject.trim(), body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Thanks — your report was sent");
      setSubject("");
      setBody("");
      void qc.invalidateQueries({ queryKey: ["tickets", meId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't send that"),
  });

  return (
    <>
      <header className="sticky top-0 z-30 glass flex items-center gap-3 px-4 py-3">
        <Link to="/settings" aria-label="Back to settings">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-xl font-bold">Help &amp; Support</h1>
      </header>

      <section className="px-4 py-5">
        <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
          FAQ
        </h2>
        <div className="space-y-2">
          {faqs.map((f, i) => (
            <div key={f.q} className="rounded-3xl bg-card px-4 py-3">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center gap-3 text-left"
              >
                <span className="flex-1 text-sm font-semibold">{f.q}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`}
                />
              </button>
              {open === i && <p className="pt-2 text-sm text-muted-foreground">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 pb-8">
        <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Report a problem
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
          className="space-y-3"
        >
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What's the problem?"
            className="w-full rounded-2xl bg-card px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Tell us what happened…"
            className="h-28 w-full rounded-2xl bg-card p-4 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={submit.isPending}
            className="gradient-chill flex h-12 w-full items-center justify-center rounded-full font-semibold text-primary-foreground disabled:opacity-60"
          >
            {submit.isPending ? "Sending…" : "Send report"}
          </button>
        </form>

        {(tickets.data?.length ?? 0) > 0 && (
          <div className="mt-6 space-y-2">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Your reports</h3>
            {tickets.data?.map((t) => (
              <div key={t.id} className="rounded-2xl bg-card px-4 py-3">
                <p className="text-sm font-semibold">{t.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {t.status} · {timeAgo(t.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
