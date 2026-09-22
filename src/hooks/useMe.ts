import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/chill";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    staleTime: 60_000,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      let { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) {
        const meta = (user.user_metadata ?? {}) as Record<string, string>;
        const base =
          (meta["username"] || user.email?.split("@")[0] || "chiller")
            .replace(/[^a-zA-Z0-9_.]/g, "")
            .slice(0, 20) || "chiller";
        let username = base;
        for (let i = 0; i < 6; i++) {
          const { data, error } = await supabase
            .from("profiles")
            .insert({
              id: user.id,
              username,
              display_name: meta["display_name"] ?? base,
            })
            .select()
            .single();
          if (!error) {
            profile = data;
            break;
          }
          username = `${base}${Math.floor(Math.random() * 9999)}`;
        }
      }

      return { user, profile: profile as Profile | null };
    },
  });
}
