import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Ava } from "./Ava";
import { useMe } from "@/hooks/useMe";

export function TopBar({ title = "ChillSnap" }: { title?: string }) {
  const { data } = useMe();

  return (
    <header className="sticky top-0 z-30 glass mx-auto flex max-w-lg items-center justify-between px-4 py-3">
      <h1 className="font-display text-2xl font-bold text-gradient">{title}</h1>
      <div className="flex items-center gap-3">
        <Link
          to="/discover"
          aria-label="Discover people"
          className="rounded-full bg-secondary p-2 text-foreground"
        >
          <Search className="h-4 w-4" />
        </Link>
        <Link to="/profile" aria-label="Your profile">
          <Ava profile={data?.profile} size={36} ring />
        </Link>
      </div>
    </header>
  );
}
