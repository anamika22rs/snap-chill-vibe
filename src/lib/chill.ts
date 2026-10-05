import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  status: string | null;
  is_private: boolean;
  is_hidden?: boolean;
  snap_score: number;
  created_at: string;
};

export type Post = {
  id: string;
  user_id: string;
  kind: string;
  media_url: string | null;
  caption: string | null;
  location: string | null;
  created_at: string;
  media_type?: string;
  vibe?: string | null;
  hashtags?: string[];
};

export const REEL_VIBES = ["Chill", "Hype", "Funny", "Aesthetic", "Romantic", "Travel", "Dance", "Food"];

export const SNAP_FILTERS = [
  { id: "none", label: "Original", className: "filter-none" },
  { id: "vibe", label: "Vibe", className: "filter-vibe" },
  { id: "dreamy", label: "Dreamy", className: "filter-dreamy" },
  { id: "noir", label: "Noir", className: "filter-noir" },
  { id: "retro", label: "Retro", className: "filter-retro" },
  { id: "neon", label: "Neon", className: "filter-neon" },
] as const;

export function filterClass(id: string | null | undefined) {
  return SNAP_FILTERS.find((f) => f.id === id)?.className ?? "filter-none";
}

const urlCache = new Map<string, string>();

/** Resolve a storage path (or pass through a full URL) to a viewable URL. */
export async function resolveMedia(path: string): Promise<string> {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  const cached = urlCache.get(path);
  if (cached) return cached;
  const { data } = await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 6);
  const url = data?.signedUrl ?? "";
  if (url) urlCache.set(path, url);
  return url;
}

export async function uploadMedia(file: Blob, userId: string, ext = "jpg") {
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export const REEL_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const REEL_MAX_BYTES = 200 * 1024 * 1024;

export function videoExt(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ["mp4", "mov", "webm", "m4v"].includes(fromName)) return fromName;
  if (file.type === "video/quicktime") return "mov";
  if (file.type === "video/webm") return "webm";
  return "mp4";
}

/**
 * Uploads a video to the private media bucket at reels/{userId}/{uuid}.{ext}
 * using resumable (chunked) uploads, which handle large phone videos reliably.
 */
export async function uploadWithProgress(
  file: File,
  userId: string,
  ext: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired — please sign in again");
  const projectId = import.meta.env['VITE_SUPABASE_PROJECT_ID'] as string;
  const key = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string;
  const path = `reels/${userId}/${crypto.randomUUID()}.${ext}`;
  const contentType =
    file.type || (ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : "video/mp4");
  const { Upload } = await import("tus-js-client");

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 10000],
      headers: { authorization: `Bearer ${token}`, apikey: key, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: "media", objectName: path, contentType, cacheControl: "3600" },
      onProgress: (sent, total) => onProgress(total ? Math.round((sent / total) * 100) : 0),
      onSuccess: () => resolve(),
      onError: (err) => {
        const res = (err as { originalResponse?: { getStatus(): number; getBody(): string } | null })
          .originalResponse;
        let msg = err.message;
        if (res) {
          const body = res.getBody();
          try {
            const j = JSON.parse(body);
            msg = j.message || j.error || body;
          } catch {
            msg = body || `status ${res.getStatus()}`;
          }
          msg = `${msg} (status ${res.getStatus()})`;
        }
        reject(new Error(`Upload failed: ${msg}`));
      },
    });
    upload.start();
  });
  return path;
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function timeLeft(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "gone";
  const h = Math.floor(diff / 3600000);
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.floor(diff / 60000))}m left`;
}

export function pairKey(a: string, b: string) {
  return a < b ? [a, b] : [b, a];
}
