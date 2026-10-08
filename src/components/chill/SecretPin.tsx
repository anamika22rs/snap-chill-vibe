import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function SecretPin({ onSaved }: { onSaved?: () => void } = {}) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const has = useQuery({
    queryKey: ["has-hidden-pin"],
    queryFn: async () => {
      const { data } = await supabase.rpc("has_hidden_pin");
      return data === true;
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!/^[0-9]{4,8}$/.test(pin)) throw new Error("PIN must be 4–8 digits");
      if (pin !== pin2) throw new Error("PINs don't match");
      const { error } = await supabase.rpc("set_hidden_pin", { _pin: pin });
      if (error) throw error;
    },
    onSuccess: () => {
      setPin("");
      setPin2("");
      toast.success("Secret PIN saved");
      void has.refetch();
      onSaved?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save PIN"),
  });
  return (
    <section className="rounded-3xl bg-card p-4">
      <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Secret PIN
      </h2>
      <p className="pt-2 text-xs text-muted-foreground">
        {has.data
          ? "Your PIN is set."
          : "Set a 4–8 digit PIN."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="mt-3 flex flex-col gap-2"
      >
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder={has.data ? "New PIN" : "PIN"}
          className="rounded-full bg-secondary px-4 py-2.5 text-sm outline-none"
        />
        <input
          type="password"
          inputMode="numeric"
          value={pin2}
          onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="Confirm PIN"
          className="rounded-full bg-secondary px-4 py-2.5 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={save.isPending}
          className="gradient-chill rounded-full py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? "Saving…" : has.data ? "Change PIN" : "Set PIN"}
        </button>
      </form>
    </section>
  );
}
