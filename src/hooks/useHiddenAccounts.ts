import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "./useMe";

/** IDs of accounts I've hidden from my own view (owner-only via RLS). */
export function useHiddenIds() {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const q = useQuery({
    queryKey: ["hidden-accounts", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await supabase.from("hidden_accounts").select("hidden_id").eq("owner_id", meId!);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.hidden_id));
    },
  });
  return q.data ?? new Set<string>();
}
