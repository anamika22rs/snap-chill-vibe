import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import type { Profile } from "@/lib/chill";
import { cn } from "@/lib/utils";

export function FollowButton({
  target,
  className,
}: {
  target: Pick<Profile, "id" | "username" | "is_private">;
  className?: string;
}) {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();

  const state = useQuery({
    queryKey: ["follow", meId, target.id],
    enabled: !!meId,
    queryFn: async () => {
      const { data } = await supabase
        .from("follows")
        .select("status")
        .eq("follower_id", meId!)
        .eq("following_id", target.id)
        .maybeSingle();
      return data?.status ?? null;
    },
  });

  const toggle = useMutation({
    mutationFn: async () => {
      if (!meId) return;
      if (state.data) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", meId)
          .eq("following_id", target.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("follows").insert({
          follower_id: meId,
          following_id: target.id,
          status: target.is_private ? "pending" : "accepted",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["follow", meId, target.id] });
      qc.invalidateQueries({ queryKey: ["friends"] });
      qc.invalidateQueries({ queryKey: ["profile-stats"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: () => toast.error("Couldn't update that"),
  });

  if (meId === target.id) return null;

  const label = toggle.isPending
    ? "…"
    : state.data === "accepted"
      ? "Following"
      : state.data === "pending"
        ? "Requested"
        : "Follow";

  return (
    <button
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending || state.isLoading}
      className={cn(
        "rounded-full px-4 py-2 text-xs font-bold disabled:opacity-60",
        state.data
          ? "bg-secondary text-foreground"
          : "gradient-chill text-primary-foreground",
        className,
      )}
    >
      {label}
    </button>
  );
}
