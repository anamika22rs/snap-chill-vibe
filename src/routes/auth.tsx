import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizeUsername, usernameToLogin, USERNAME_RE } from "@/lib/usernameAuth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { mode?: "signin" } => ({
    ...(search["mode"] === "signin" ? { mode: "signin" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Sign in to ChillSnap" },
      { name: "description", content: "Create your ChillSnap account with a username or sign back in." },
      { property: "og:title", content: "Sign in to ChillSnap" },
      { property: "og:description", content: "Create your ChillSnap account with a username or sign back in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const field =
  "w-full rounded-2xl bg-card px-5 py-4 text-sm outline-none ring-primary/50 placeholder:text-muted-foreground focus:ring-2";

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode === "signin" ? "signin" : "signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/feed", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const uname = normalizeUsername(username);
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!USERNAME_RE.test(uname))
          throw new Error("Username: 3–20 letters, numbers, dots or underscores");
        if (password.length < 8) throw new Error("Password must be at least 8 characters");
        if (password !== confirm) throw new Error("Passwords don't match");
        const { data: free } = await supabase.rpc("username_available", { _username: uname });
        if (free === false) throw new Error("That username is taken");
        const { data, error } = await supabase.auth.signUp({
          email: usernameToLogin(uname),
          password,
          options: { data: { username: uname, status: status.trim() || null } },
        });
        if (error) throw error;
        if (!data.session) throw new Error("Couldn't start your session, try signing in");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: usernameToLogin(uname),
          password,
        });
        if (error) throw new Error("Wrong username or password");
      }
      navigate({ to: "/feed", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(/already registered/i.test(msg) ? "That username is taken" : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-10">
      <h1 className="font-display text-4xl font-extrabold text-gradient">ChillSnap</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          autoCapitalize="none"
          required
          minLength={3}
          className={field}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          className={field}
        />
        {mode === "signup" && (
          <>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
              required
              className={field}
            />
            <input
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="Status (e.g. chilling ✨)"
              maxLength={80}
              className={field}
            />
          </>
        )}
        <button
          type="submit"
          disabled={busy}
          className="gradient-chill glow flex h-14 w-full items-center justify-center rounded-full font-display text-lg font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "One sec…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <button
        onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
        className="mt-6 text-center text-sm text-muted-foreground"
      >
        {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </main>
  );
}
