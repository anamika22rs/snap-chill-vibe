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
 * Uploads a reel video to the private media bucket at reels/{userId}/{uuid}.{ext}
 * using the standard Storage upload. onProgress gets 0 at start and 100 when done.
 */
export async function uploadWithProgress(
  file: File,
  userId: string,
  ext: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || auth.user.id !== userId) throw new Error("Your session expired — please sign in again");
  if (file.size > REEL_MAX_BYTES) throw new Error("Video must be 200 MB or smaller.");
  const contentType =
    file.type || (ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : "video/mp4");
  if (!contentType.startsWith("video/")) throw new Error("Please choose an MP4, MOV or WebM video");

  const path = `reels/${userId}/${crypto.randomUUID()}.${ext}`;
  onProgress(0);
  const { error } = await supabase.storage
    .from("media")
    .upload(path, file, { contentType, upsert: false, cacheControl: "3600" });
  if (error) {
    const status = (error as { statusCode?: string | number }).statusCode;
    throw new Error(`Upload failed: ${error.message}${status ? ` (status ${status})` : ""}`);
  }
  onProgress(100);
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
