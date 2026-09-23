import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, Pencil, Flame, X, Camera } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Ava } from "@/components/chill/Ava";
import { Media } from "@/components/chill/Media";
import { Uploader } from "@/components/chill/Uploader";
import { uploadMedia, type Post } from "@/lib/chill";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — ChillSnap" },
      { name: "description", content: "Your ChillSnap profile, posts and settings." },
      { property: "og:title", content: "Your profile — ChillSnap" },
      { property: "og:description", content: "Your ChillSnap profile, posts and settings." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { data: me, isLoading } = useMe();
  const meId = me?.user.id;
  const profile = me?.profile;
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const stats = useQuery({
    queryKey: ["profile-stats", meId],
    enabled: !!meId,
    queryFn: async () => {
      const [posts, followers, following] = await Promise.all([
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", meId!),
        supabase
          .from("follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("following_id", meId!)
          .eq("status", "accepted"),
        supabase
          .from("follows")
          .select("following_id", { count: "exact", head: true })
          .eq("follower_id", meId!)
          .eq("status", "accepted"),
      ]);
      return {
        posts: posts.count ?? 0,
        followers: followers.count ?? 0,
        following: following.count ?? 0,
      };
    },
  });

  const myPosts = useQuery({
    queryKey: ["my-posts", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("user_id", meId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Post[];
    },
  });

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">Loading your profile…</p>;
  }

  return (
    <>
      <header className="sticky top-0 z-30 glass flex items-center justify-between px-4 py-3">
        <h1 className="font-display text-2xl font-bold text-gradient">Profile</h1>
        <Link to="/settings" aria-label="Settings" className="rounded-full bg-secondary p-2">
          <Settings className="h-4 w-4" />
        </Link>
      </header>

      <section className="px-4 py-5">
        <div className="flex items-center gap-4">
          <Ava profile={profile} size={84} ring />
          <div className="flex-1">
            <p className="font-display text-xl font-bold">
              {profile?.display_name || profile?.username}
            </p>
            <p className="text-sm text-muted-foreground">@{profile?.username}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-flame">
              <Flame className="h-3.5 w-3.5" /> snap score {profile?.snap_score ?? 0}
            </p>
          </div>
        </div>

        {profile?.status && <p className="mt-3 text-sm">{profile.status}</p>}
        {profile?.bio && <p className="mt-1 text-sm text-muted-foreground">{profile.bio}</p>}

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["Posts", stats.data?.posts ?? 0],
            ["Followers", stats.data?.followers ?? 0],
            ["Following", stats.data?.following ?? 0],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-2xl bg-card py-3">
              <p className="font-display text-lg font-bold">{value as number}</p>
              <p className="text-[11px] text-muted-foreground">{label as string}</p>
            </div>
          ))}
        </div>

        <button
          onClick={() => setEditing(true)}
          className="gradient-chill mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full font-semibold text-primary-foreground"
        >
          <Pencil className="h-4 w-4" /> Edit profile
        </button>
      </section>

      <section className="px-4">
        <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Your posts
        </h2>
        {myPosts.isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading posts…</p>
        )}
        {myPosts.data?.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing posted yet. Tap Create to share your first one.
          </p>
        )}
        <div className="grid grid-cols-3 gap-1">
          {myPosts.data?.map((p) =>
            p.media_url ? (
              <Media key={p.id} path={p.media_url} className="aspect-square w-full object-cover" />
            ) : (
              <div
                key={p.id}
                className="flex aspect-square items-center justify-center rounded-sm bg-card p-2 text-[10px] text-muted-foreground"
              >
                {p.caption?.slice(0, 60)}
              </div>
            ),
          )}
        </div>
      </section>

      {editing && meId && profile && (
        <EditSheet
          onClose={() => setEditing(false)}
          onSaved={() => {
            void qc.invalidateQueries();
            setEditing(false);
          }}
          meId={meId}
          initial={profile}
        />
      )}
    </>
  );
}

function EditSheet({
  meId,
  initial,
  onClose,
  onSaved,
}: {
  meId: string;
  initial: { username: string; display_name: string | null; status: string | null; bio: string | null; avatar_url: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(initial.username);
  const [displayName, setDisplayName] = useState(initial.display_name ?? "");
  const [status, setStatus] = useState(initial.status ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [avatar, setAvatar] = useState<{ file: File; preview: string } | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const clean = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, "");
      if (clean.length < 3) throw new Error("Username needs at least 3 characters");
      const avatarPath = avatar ? await uploadMedia(avatar.file, meId) : initial.avatar_url;
      const { error } = await supabase
        .from("profiles")
        .update({
          username: clean,
          display_name: displayName.trim() || null,
          status: status.trim() || null,
          bio: bio.trim() || null,
          avatar_url: avatarPath,
        })
        .eq("id", meId);
      if (error) {
        throw new Error(
          error.code === "23505" ? "That username is already taken" : "Couldn't save your profile",
        );
      }
    },
    onSuccess: () => {
      toast.success("Profile saved");
      onSaved();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't save"),
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background px-4 pb-10">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between py-4">
          <button onClick={onClose} aria-label="Cancel">
            <X className="h-6 w-6" />
          </button>
          <p className="font-display font-bold">Edit profile</p>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="text-sm font-semibold text-primary disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 py-4">
          {avatar ? (
            <img src={avatar.preview} alt="" className="h-24 w-24 rounded-full object-cover" />
          ) : (
            <Ava profile={{ ...initial }} size={96} ring />
          )}
          <Uploader
            onPick={(file, preview) => setAvatar({ file, preview })}
            className="flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-xs font-semibold"
          >
            <Camera className="h-4 w-4" /> Change photo
          </Uploader>
        </div>

        <div className="space-y-3">
          <Field label="Username" value={username} onChange={setUsername} />
          <Field label="Display name" value={displayName} onChange={setDisplayName} />
          <Field label="Status" value={status} onChange={setStatus} placeholder="Chilling ✨" />
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Bio</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="h-24 w-full rounded-2xl bg-card p-4 text-sm outline-none"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl bg-card px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}
