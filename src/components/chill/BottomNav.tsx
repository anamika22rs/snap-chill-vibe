import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Clapperboard, Camera, MessageCircle, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/feed", icon: Home, label: "Feed" },
  { to: "/reels", icon: Clapperboard, label: "Reels" },
  { to: "/snap", icon: Camera, label: "Snap", center: true },
  { to: "/chat", icon: MessageCircle, label: "Chat" },
  { to: "/map", icon: MapPin, label: "Map" },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

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
                "flex w-14 flex-col items-center gap-1 rounded-2xl py-2 text-[10px] transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_currentColor]")} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
