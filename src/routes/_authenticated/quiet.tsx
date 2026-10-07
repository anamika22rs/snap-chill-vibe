import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Ava } from "@/components/chill/Ava";
import type { Profile } from "@/lib/chill";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/hidden-accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — ChillSnap" },
      { name: "description", content: "Your private ChillSnap preferences." },
      { property: "og:title", content: "Accounts — ChillSnap" },
      { property: "og:description", content: "Your private ChillSnap preferences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HiddenAccounts,
});

const UNLOCK_KEY = "chill-hidden-unlocked";

function HiddenAccounts() {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const t = Number(sessionStorage.getItem(UNLOCK_KEY) ?? 0);
    if (Date.now() - t < 10 * 60 * 1000) setOk(true);
    else navigate({ to: "/search", replace: true });
  }, [navigate]);

  const list = useQuery({
    queryKey: ["hidden-accounts-list", meId],
    enabled: !!meId && ok,
    queryFn: async () => {
      if (!meId) throw new Error("Please sign in again");
      const { data, error } = await supabase
        .from("hidden_accounts")
        .select("hidden_id, created_at")
        .eq("owner_id", meId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.hidden_id);
      if (!ids.length) return [];
      const { data: profs, error: profileError } = await supabase.from("profiles").select("*").in("id", ids);
      if (profileError) throw profileError;
      const byId = new Map((profs ?? []).map((p) => [p.id, p as Profile]));
      return ids.map((id) => ({ id, profile: byId.get(id) ?? null }));
    },
  });

  const unhide = useMutation({
    mutationFn: async (id: string) => {
      if (!meId) throw new Error("Please sign in again");
      const { error } = await supabase.from("hidden_accounts").delete().eq("owner_id", meId).eq("hidden_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Quiet Mode disabled");
      void qc.invalidateQueries({ queryKey: ["hidden-accounts"] });
      void qc.invalidateQueries({ queryKey: ["hidden-accounts-list"] });
      void qc.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: () => toast.error("Couldn't update that preference"),
  });

  function leave() {
    sessionStorage.removeItem(UNLOCK_KEY);
    navigate({ to: "/search", replace: true });
  }

  if (!ok) return null;
  return (
    <>
      <header className="sticky top-0 z-30 glass flex items-center gap-3 px-4 py-3">
        <Button variant="ghost" size="icon" onClick={leave} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-display text-xl font-bold">Accounts</h1>
      </header>
      <div className="space-y-2 px-4 py-5">
        {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {list.isError && <p className="text-sm text-destructive">Couldn't load accounts.</p>}
        {list.data?.length === 0 && <p className="text-sm text-muted-foreground">No accounts.</p>}
        {list.data?.map(({ id, profile }) => (
          <div key={id} className="flex items-center gap-3 rounded-3xl bg-card px-4 py-3">
            {profile ? (
              <Link to="/u/$username" params={{ username: profile.username }} className="flex min-w-0 flex-1 items-center gap-3">
                <Ava profile={profile} size={42} />
                <p className="truncate text-sm font-semibold">@{profile.username}</p>
              </Link>
            ) : (
              <p className="flex-1 text-sm text-muted-foreground">Unavailable account</p>
            )}
            {profile && <Button asChild variant="secondary" size="sm" className="rounded-full">
              <Link to="/u/$username" params={{ username: profile.username }}>Open</Link>
            </Button>}
            <Button variant="secondary" size="sm"
              onClick={() => unhide.mutate(id)}
              disabled={unhide.isPending}
              className="flex items-center gap-1 rounded-full bg-secondary px-3 py-2 text-xs font-bold disabled:opacity-60"
            >
              <Eye className="h-3.5 w-3.5" /> Unhide
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}
