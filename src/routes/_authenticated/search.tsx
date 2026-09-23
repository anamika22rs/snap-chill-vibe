import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Ava } from "@/components/chill/Ava";
import { FollowButton } from "@/components/chill/FollowButton";
import type { Profile } from "@/lib/chill";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({
    meta: [
      { title: "Search people — ChillSnap" },
      { name: "description", content: "Find registered ChillSnap users by username." },
      { property: "og:title", content: "Search people — ChillSnap" },
      { property: "og:description", content: "Find registered ChillSnap users by username." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const [q, setQ] = useState("");
  const term = q.trim();

  const results = useQuery({
    queryKey: ["search", term, meId],
    enabled: !!meId,
    queryFn: async () => {
      let query = supabase.from("profiles").select("*").neq("id", meId!).limit(40);
      query = term
        ? query.or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
        : query.order("created_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  return (
    <>
      <header className="sticky top-0 z-30 glass px-4 py-3">
        <h1 className="font-display text-2xl font-bold text-gradient">Search</h1>
        <div className="mt-3 flex items-center gap-2 rounded-full bg-card px-4 py-2.5">
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by username or name"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </header>

      <div className="space-y-2 px-4 py-4">
        {results.isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">Searching…</p>
        )}
        {results.isError && (
          <p className="py-8 text-center text-sm text-destructive">
            Couldn't load people. Pull down to try again.
          </p>
        )}
        {results.data?.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {term ? `No one matches "${term}" yet.` : "No other members yet."}
          </p>
        )}
        {results.data?.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-3xl bg-card px-4 py-3">
            <Link to="/u/$username" params={{ username: p.username }}>
              <Ava profile={p} size={46} ring />
            </Link>
            <Link to="/u/$username" params={{ username: p.username }} className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">@{p.username}</p>
              <p className="truncate text-xs text-muted-foreground">
                {p.display_name ?? p.status ?? (p.is_private ? "Private account" : "ChillSnap user")}
              </p>
            </Link>
            <FollowButton target={p} />
          </div>
        ))}
      </div>
    </>
  );
}
