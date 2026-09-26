import { useBack } from "@/hooks/useBack";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, HelpCircle, LogOut, Lock, MapPin, Ban, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Ava } from "@/components/chill/Ava";
import type { Profile } from "@/lib/chill";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ChillSnap" },
      { name: "description", content: "Privacy, blocked accounts, support and sign out." },
      { property: "og:title", content: "Settings — ChillSnap" },
      { property: "og:description", content: "Privacy, blocked accounts, support and sign out." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const profile = me?.profile;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const location = useQuery({
    queryKey: ["my-location", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data } = await supabase
        .from("snap_locations")
        .select("sharing")
        .eq("user_id", meId!)
        .maybeSingle();
      return data?.sharing ?? false;
    },
  });

  const blocks = useQuery({
    queryKey: ["blocks", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_blocked_accounts" as never);
      if (error) throw error;
      return ((data ?? []) as unknown as Profile[]);
    },
  });

  const setPrivate = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase.from("profiles").update({ is_private: value }).eq("id", meId!);
      if (error) throw error;
    },
    onSuccess: (_d, value) => {
      toast.success(value ? "Your account is private" : "Your account is public");
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: () => toast.error("Couldn't change that setting"),
  });

  const setSharing = useMutation({
    mutationFn: async (value: boolean) => {
      if (!value) {
        const { error } = await supabase
          .from("snap_locations")
          .update({ sharing: false })
          .eq("user_id", meId!);
        if (error) throw error;
        return;
      }
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 }),
      );
      const { error } = await supabase.from("snap_locations").upsert({
        user_id: meId!,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        sharing: true,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-location", meId] });
      void qc.invalidateQueries({ queryKey: ["map"] });
    },
    onError: () => toast.error("Location sharing needs permission on your device"),
  });

  const unblock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker_id", meId!)
        .eq("blocked_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unblocked");
      void qc.invalidateQueries();
    },
    onError: () => toast.error("Couldn't unblock"),
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const back = useBack("/profile");
  return (
    <>
      <header className="sticky top-0 z-30 glass flex items-center gap-3 px-4 py-3">
        <button onClick={back} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-display text-xl font-bold">Settings</h1>
      </header>

      <div className="space-y-6 px-4 py-5">
        <section className="rounded-3xl bg-card p-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Privacy
          </h2>
          <Row
            icon={<Lock className="h-4 w-4 text-primary" />}
            title="Private account"
            subtitle="Only approved followers can see your posts and stories"
          >
            <Toggle
              on={!!profile?.is_private}
              busy={setPrivate.isPending}
              onToggle={() => setPrivate.mutate(!profile?.is_private)}
            />
          </Row>
          <Row
            icon={<MapPin className="h-4 w-4 text-primary" />}
            title="Share my location"
            subtitle="Show your pin on the snap map to people you allow"
          >
            <Toggle
              on={!!location.data}
              busy={setSharing.isPending}
              onToggle={() => setSharing.mutate(!location.data)}
            />
          </Row>
        </section>

        <section className="rounded-3xl bg-card p-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Blocked accounts
          </h2>
          {blocks.isLoading && <p className="py-4 text-sm text-muted-foreground">Loading…</p>}
          {blocks.data?.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">You haven't blocked anyone.</p>
          )}
          <div className="space-y-2 pt-2">
            {blocks.data?.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <Ava profile={p} size={38} />
                <p className="flex-1 truncate text-sm font-semibold">@{p.username}</p>
                <button
                  onClick={() => unblock.mutate(p.id)}
                  disabled={unblock.isPending}
                  className="flex items-center gap-1 rounded-full bg-secondary px-3 py-2 text-xs font-bold disabled:opacity-60"
                >
                  <Ban className="h-3.5 w-3.5" /> Unblock
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <Link
            to="/settings/hidden"
            className="flex items-center gap-3 rounded-3xl bg-card px-4 py-4 text-sm font-semibold"
          >
            <EyeOff className="h-4 w-4 text-primary" /> Hidden posts
          </Link>
          <Link
            to="/help"
            className="flex items-center gap-3 rounded-3xl bg-card px-4 py-4 text-sm font-semibold"
          >
            <HelpCircle className="h-4 w-4 text-primary" /> Help &amp; Support
          </Link>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-3xl bg-card px-4 py-4 text-sm font-semibold text-destructive"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
          <p className="px-2 pt-2 text-xs text-muted-foreground">
            Signed in as @{me?.profile?.username ?? "you"}
          </p>
        </section>
      </div>
    </>
  );
}

function Row({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-border/60 py-4 first-of-type:border-t-0">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  on,
  busy,
  onToggle,
}: {
  on: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={onToggle}
      className={`h-7 w-12 shrink-0 rounded-full p-1 transition-colors disabled:opacity-60 ${on ? "gradient-chill" : "bg-secondary"}`}
    >
      <span
        className={`block h-5 w-5 rounded-full bg-background transition-transform ${on ? "translate-x-5" : ""}`}
      />
    </button>
  );
}
