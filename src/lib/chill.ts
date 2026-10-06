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

function describeStorageError(error: unknown): string {
  const e = error as { message?: string; statusCode?: string | number; status?: number; error?: string; originalError?: { message?: string } };
  const parts = [e?.message || "Unknown error"];
  const status = e?.statusCode ?? e?.status;
  if (status) parts.push(`status ${status}`);
  if (e?.error && e.error !== e.message) parts.push(e.error);
  if (e?.originalError?.message && e.originalError.message !== e.message) parts.push(e.originalError.message);
  return parts.join(" · ");
}

/** True when the browser can reach the storage service at all. */
async function storageReachable(): Promise<boolean> {
  try {
    const base = import.meta.env['VITE_SUPABASE_URL'] as string;
    const res = await fetch(`${base}/storage/v1/version`, { method: "GET", cache: "no-store" });
    return res.status > 0;
  } catch {
    return false;
  }
}

/**
 * Uploads a reel video to the private media bucket at reels/{userId}/{uuid}.{ext}
 * using the standard Storage upload. onProgress gets 0 at start and 100 when done.
 *
 * The file is copied into memory first: on Android, gallery/cloud files picked via
 * <input type=file> can become unreadable mid-request, which surfaces as a bare
 * "Failed to fetch". Reading upfront makes that failure explicit and the upload stable.
 */
export async function uploadWithProgress(
  file: File,
  userId: string,
  ext: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) throw new Error("You're signed out — please sign in again, then retry.");
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth.user || auth.user.id !== userId)
    throw new Error(`Your session expired — please sign in again. ${authErr ? describeStorageError(authErr) : ""}`.trim());
  if (file.size > REEL_MAX_BYTES) throw new Error("Video must be 200 MB or smaller.");
  if (file.size === 0) throw new Error("This video file is empty — pick another one.");
  const contentType =
    file.type || (ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : "video/mp4");
  if (!contentType.startsWith("video/")) throw new Error("Please choose an MP4, MOV or WebM video");
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    throw new Error("You're offline — connect to the internet and tap Retry upload.");

  onProgress(0);
  let body: Blob;
  try {
    body = new Blob([await file.arrayBuffer()], { type: contentType });
  } catch (err) {
    throw new Error(
      `Couldn't read the video from your phone (${err instanceof Error ? err.message : "read error"}). ` +
        "If it's stored in Google Photos/Drive, download it to your device first, then pick it again.",
    );
  }

  const path = `reels/${userId}/${crypto.randomUUID()}.${ext}`;
  const attempt = () =>
    supabase.storage.from("media").upload(path, body, { contentType, upsert: false, cacheControl: "3600" });

  let { error } = await attempt();
  // One automatic retry for transient network drops (common on mobile data).
  if (error && /fetch|network/i.test(error.message)) {
    await new Promise((r) => setTimeout(r, 1500));
    ({ error } = await attempt());
  }
  if (error) {
    const detail = describeStorageError(error);
    if (/fetch|network/i.test(error.message)) {
      const reachable = await storageReachable();
      throw new Error(
        reachable
          ? `Upload failed: ${detail}. The connection dropped while sending the video (${Math.round(file.size / 1048576)} MB) — try Wi-Fi or a shorter video, then tap Retry upload.`
          : `Upload failed: ${detail}. Your network can't reach ChillSnap's storage right now — check your internet, turn off any VPN/ad-blocker or data saver, then tap Retry upload.`,
      );
    }
    throw new Error(`Upload failed: ${detail}`);
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
