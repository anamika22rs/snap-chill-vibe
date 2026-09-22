import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_private: boolean;
  snap_score: number;
  created_at: string;
};

export type Post = {
  id: string;
  user_id: string;
  kind: string;
  media_url: string;
  caption: string | null;
  location: string | null;
  created_at: string;
};

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
