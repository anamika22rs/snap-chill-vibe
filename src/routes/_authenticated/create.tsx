import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Uploader } from "@/components/chill/Uploader";
import { uploadMedia } from "@/lib/chill";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({
    meta: [
      { title: "Create — ChillSnap" },
      { name: "description", content: "Post, drop a reel or add a 24-hour story on ChillSnap." },
      { property: "og:title", content: "Create — ChillSnap" },
      { property: "og:description", content: "Post, drop a reel or add a 24-hour story." },
    ],
  }),
  component: CreatePage,
});

type Kind = "post" | "reel" | "story";

function CreatePage() {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [kind, setKind] = useState<Kind>("post");
  const [pick, setPick] = useState<{ file: File; preview: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      if (!meId) throw new Error("Not signed in");
      if (kind !== "post" && !pick) throw new Error("Pick a photo first");
      if (kind === "post" && !pick && !caption.trim()) throw new Error("Add a photo or some words");

      const path = pick ? await uploadMedia(pick.file, meId) : null;

      if (kind === "story") {
        const { error } = await supabase
          .from("stories")
          .insert({ user_id: meId, media_url: path!, caption: caption.trim() || null });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("posts").insert({
        user_id: meId,
        kind,
        media_url: path,
        caption: caption.trim() || null,
        location: location.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(
        kind === "story" ? "Story is live for 24 hours 🔥" : kind === "reel" ? "Reel posted" : "Posted",
      );
      setPick(null);
      setCaption("");
      setLocation("");
      await qc.invalidateQueries();
      navigate({ to: kind === "reel" ? "/reels" : "/feed" });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Couldn't share that right now"),
  });

  return (
    <>
      <header className="sticky top-0 z-30 glass px-4 py-3">
        <h1 className="font-display text-2xl font-bold text-gradient">Create</h1>
      </header>

      <div className="px-4 py-4">
        <div className="flex gap-2">
          {(["post", "reel", "story"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={
                k === kind
                  ? "gradient-chill rounded-full px-4 py-2 text-xs font-bold text-primary-foreground"
                  : "rounded-full bg-secondary px-4 py-2 text-xs font-semibold"
              }
            >
              {k === "post" ? "Post" : k === "reel" ? "Reel" : "Story"}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {pick ? (
            <div className="relative overflow-hidden rounded-3xl">
              <img src={pick.preview} alt="" className="aspect-square w-full object-cover" />
              <button
                onClick={() => setPick(null)}
                aria-label="Remove photo"
                className="glass absolute right-3 top-3 rounded-full p-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Uploader
              onPick={(file, preview) => setPick({ file, preview })}
              className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-card"
            >
              <ImagePlus className="h-8 w-8 text-primary" />
              <span className="text-sm text-muted-foreground">
                {kind === "post" ? "Add a photo (optional)" : "Choose a photo from your gallery"}
              </span>
            </Uploader>
          )}
        </div>

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={kind === "story" ? "Add a note…" : "Write something…"}
          className="mt-4 h-24 w-full rounded-2xl bg-card p-4 text-sm outline-none placeholder:text-muted-foreground"
        />

        {kind !== "story" && (
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Add a location (optional)"
            className="mt-3 w-full rounded-2xl bg-card px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        )}

        <button
          onClick={() => submit.mutate()}
          disabled={submit.isPending}
          className="gradient-chill glow mt-5 flex h-14 w-full items-center justify-center rounded-full font-display text-lg font-bold text-primary-foreground disabled:opacity-60"
        >
          {submit.isPending ? "Sharing…" : kind === "story" ? "Add to story" : "Share"}
        </button>
      </div>
    </>
  );
}
