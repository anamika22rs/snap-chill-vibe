import { Media } from "./Media";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/chill";

export function Ava({
  profile,
  size = 44,
  ring = false,
  className,
}: {
  profile?: Pick<Profile, "username" | "avatar_url" | "display_name"> | null;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const inner = profile?.avatar_url ? (
    <Media
      path={profile.avatar_url}
      className="h-full w-full rounded-full object-cover"
      alt={profile.username}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-full gradient-chill font-display text-primary-foreground">
      <span style={{ fontSize: size * 0.4 }}>
        {(profile?.username ?? "?").slice(0, 1).toUpperCase()}
      </span>
    </div>
  );

  return (
    <div
      className={cn(
        "shrink-0 rounded-full",
        ring ? "ring-story" : "bg-secondary p-[2px]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <div className="h-full w-full overflow-hidden rounded-full bg-card">{inner}</div>
    </div>
  );
}
