import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Home, Search, PlusSquare, Bell, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { cn } from "@/lib/utils";

const items = [
  { to: "/feed", icon: Home, label: "Home", center: false as boolean },
  { to: "/search", icon: Search, label: "Search", center: false as boolean },
  { to: "/create", icon: PlusSquare, label: "Create", center: true as boolean },
  { to: "/activity", icon: Bell, label: "Activity", center: false as boolean },
  { to: "/profile", icon: User, label: "Profile", center: false as boolean },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: me } = useMe();
  const meId = me?.user.id;

  const unread = useQuery({
    queryKey: ["unread-activity", meId],
    enabled: !!meId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", meId!)
        .is("read_at", null);
      return count ?? 0;
    },
  });

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg px-3 pb-3">
      <div className="glass flex items-center justify-between rounded-3xl px-3 py-2">
        {items.map(({ to, icon: Icon, label, center }) => {
          const active = pathname.startsWith(to);
          if (center) {
            return (
              <Link
                key={to}
                to={to}
                aria-label={label}
                className="gradient-chill glow -mt-6 flex h-14 w-14 items-center justify-center rounded-full text-primary-foreground transition-transform active:scale-90"
              >
                <Icon className="h-7 w-7" />
              </Link>
            );
          }
          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              className={cn(
                "relative flex w-14 flex-col items-center gap-1 rounded-2xl py-2 text-[10px] transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_currentColor]")} />
              {label}
              {label === "Activity" && (unread.data ?? 0) > 0 && (
                <span className="gradient-flame absolute right-2 top-1 min-w-4 rounded-full px-1 text-[9px] font-bold leading-4 text-primary-foreground">
                  {unread.data! > 9 ? "9+" : unread.data}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
