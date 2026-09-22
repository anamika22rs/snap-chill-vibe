import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search["mode"] === "signin" ? "signin" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in to ChillSnap" },
      { name: "description", content: "Create your ChillSnap account or sign back in." },
      { property: "og:title", content: "Sign in to ChillSnap" },
      { property: "og:description", content: "Create your ChillSnap account or sign back in." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(
    search.mode === "signin" ? "signin" : "signup",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/feed", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: username.trim(), display_name: username.trim() },
          },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/feed", replace: true });
        else setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/feed", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/feed", replace: true });
  }

  if (sent) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="glass max-w-sm rounded-3xl p-8 text-center">
          <h1 className="font-display text-2xl font-bold text-gradient">Check your inbox</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We sent a confirmation link to {email}. Tap it to start chilling.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-10">
      <h1 className="font-display text-4xl font-extrabold text-gradient">ChillSnap</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        {mode === "signup" && (
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            required
            minLength={3}
            className="h-13 w-full rounded-2xl bg-card px-5 py-4 text-sm outline-none ring-primary/50 placeholder:text-muted-foreground focus:ring-2"
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full rounded-2xl bg-card px-5 py-4 text-sm outline-none ring-primary/50 placeholder:text-muted-foreground focus:ring-2"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          minLength={6}
          className="w-full rounded-2xl bg-card px-5 py-4 text-sm outline-none ring-primary/50 placeholder:text-muted-foreground focus:ring-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="gradient-chill glow flex h-14 w-full items-center justify-center rounded-full font-display text-lg font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "One sec…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <button
        onClick={google}
        className="mt-3 flex h-13 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-5 py-4 text-sm font-semibold"
      >
        Continue with Google
      </button>

      <button
        onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
        className="mt-6 text-center text-sm text-muted-foreground"
      >
        {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </main>
  );
}
