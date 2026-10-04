import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Film, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Uploader } from "@/components/chill/Uploader";
import {
  REEL_MAX_BYTES,
  REEL_VIBES,
  REEL_VIDEO_TYPES,
  uploadMedia,
  uploadWithProgress,
  videoExt,
} from "@/lib/chill";

type Kind = "post" | "reel" | "story";

export const Route = createFileRoute("/_authenticated/create")({
  validateSearch: (s: Record<string, unknown>): { kind?: Kind } => {
    const k = s.kind;
    return k === "reel" || k === "story" || k === "post" ? { kind: k } : {};
  },
  head: () => ({
    meta: [
      { title: "Create — ChillSnap" },
      { name: "description", content: "Post, drop a video reel or add a 24-hour story on ChillSnap." },
      { property: "og:title", content: "Create — ChillSnap" },
      { property: "og:description", content: "Post, drop a video reel or add a 24-hour story." },
    ],
  }),
  component: CreatePage,
});

function parseHashtags(raw: string) {
  return [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#+/, "").toLowerCase().replace(/[^a-z0-9_]/g, ""))
        .filter(Boolean),
    ),
  ].slice(0, 15);
}

function CreatePage() {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [kind, setKind] = useState<Kind>(search.kind ?? "post");
  const [pick, setPick] = useState<{ file: File; preview: string } | null>(null);
  const [video, setVideo] = useState<{ file: File; preview: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [vibe, setVibe] = useState<string | null>(null);
  const [tags, setTags] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (search.kind) setKind(search.kind);
  }, [search.kind]);

  // Free the local preview when replaced/unmounted (preview only — never saved).
  useEffect(() => () => { if (video) URL.revokeObjectURL(video.preview); }, [video]);

  const onPickVideo = (file: File) => {
    setUploadError(null);
    const okType = REEL_VIDEO_TYPES.includes(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
    if (!okType) return toast.error("Please choose an MP4, MOV or WebM video");
    if (file.size > REEL_MAX_BYTES) return toast.error("That video is over 200 MB — pick a shorter one");
    setVideo({ file, preview: URL.createObjectURL(file) });
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!meId) throw new Error("Not signed in");
      setUploadError(null);

      if (kind === "reel") {
        if (!video) throw new Error("Choose a video first");
        setProgress(0);
        const path = await uploadWithProgress(video.file, meId, videoExt(video.file), setProgress);
        const { error } = await supabase.from("posts").insert({
          user_id: meId,
          kind: "reel",
          media_type: "video",
          media_url: path,
          caption: caption.trim() || null,
          vibe,
          hashtags: parseHashtags(tags),
        });
        if (error) {
          await supabase.storage.from("media").remove([path]);
          throw error;
        }
        return;
      }

      if (kind === "story" && !pick) throw new Error("Pick a photo first");
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
      toast.success(kind === "story" ? "Story is live for 24 hours 🔥" : kind === "reel" ? "Reel posted 🎬" : "Posted");
      setPick(null);
      setVideo(null);
      setCaption("");
      setLocation("");
      setVibe(null);
      setTags("");
      setProgress(null);
      await qc.invalidateQueries();
      navigate({ to: kind === "reel" ? "/reels" : "/feed", replace: true });
    },
    onError: (err) => {
      setProgress(null);
      const msg = err instanceof Error ? err.message : "Couldn't share that right now";
      setUploadError(msg);
      toast.error(msg);
    },
  });

  return (
    <>
      <header className="sticky top-0 z-30 glass px-4 py-3">
        <h1 className="font-display text-2xl font-bold text-gradient">
          {kind === "reel" ? "Create Reel" : "Create"}
        </h1>
      </header>

      <div className="px-4 py-4">
        <div className="flex gap-2">
          {(["post", "reel", "story"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              disabled={submit.isPending}
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

        {kind === "reel" ? (
          <>
            <div className="mt-4">
              {video ? (
                <div className="relative mx-auto aspect-[9/16] max-h-[60vh] overflow-hidden rounded-3xl bg-card">
                  <video
                    src={video.preview}
                    controls
                    playsInline
                    className="h-full w-full object-contain"
                  />
                  {!submit.isPending && (
                    <button
                      onClick={() => setVideo(null)}
                      aria-label="Remove video"
                      className="glass absolute right-3 top-3 rounded-full p-2"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => videoInput.current?.click()}
                  className="flex aspect-[9/16] max-h-[60vh] w-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-card"
                >
                  <Film className="h-8 w-8 text-primary" />
                  <span className="text-sm font-semibold">Choose a video</span>
                  <span className="text-xs text-muted-foreground">MP4, MOV or WebM · up to 200 MB</span>
                </button>
              )}
              <input
                ref={videoInput}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickVideo(f);
                  e.target.value = "";
                }}
              />
            </div>

            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption…"
              maxLength={2200}
              className="mt-4 h-20 w-full rounded-2xl bg-card p-4 text-sm outline-none placeholder:text-muted-foreground"
            />

            <p className="mt-3 text-xs font-semibold text-muted-foreground">Vibe</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REEL_VIBES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVibe(vibe === v ? null : v)}
                  className={
                    vibe === v
                      ? "gradient-chill rounded-full px-3 py-1.5 text-xs font-bold text-primary-foreground"
                      : "rounded-full bg-secondary px-3 py-1.5 text-xs"
                  }
                >
                  {v}
                </button>
              ))}
            </div>

            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="#hashtags (optional)"
              className="mt-3 w-full rounded-2xl bg-card px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />

            {progress !== null && (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="gradient-chill h-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {progress < 100 ? `Uploading… ${progress}%` : "Finishing up…"}
                </p>
              </div>
            )}
            {uploadError && <p className="mt-3 text-sm text-destructive">{uploadError}</p>}
          </>
        ) : (
          <>
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

            {kind === "post" && (
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add a location (optional)"
                className="mt-3 w-full rounded-2xl bg-card px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            )}
          </>
        )}

        <button
          onClick={() => submit.mutate()}
          disabled={submit.isPending || (kind === "reel" && !video)}
          className="gradient-chill glow mt-5 flex h-14 w-full items-center justify-center rounded-full font-display text-lg font-bold text-primary-foreground disabled:opacity-60"
        >
          {submit.isPending
            ? kind === "reel" ? "Posting reel…" : "Sharing…"
            : kind === "story" ? "Add to story" : kind === "reel" ? "Post Reel" : "Share"}
        </button>
      </div>
    </>
  );
}
