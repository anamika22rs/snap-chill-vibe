import { supabase } from "@/integrations/supabase/client";
import type { FeedPost } from "@/components/chill/PostCard";
import type { Post, Profile } from "@/lib/chill";

export async function fetchPosts(kind: "post" | "reel", meId: string): Promise<FeedPost[]> {
  const [{ data: rows }, { data: hidden }] = await Promise.all([
    supabase
      .from("posts")
      .select("*, author:profiles!posts_author_fkey(*)")
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.from("hidden_posts").select("post_id").eq("user_id", meId),
  ]);

  const hiddenIds = new Set((hidden ?? []).map((h) => h.post_id));
  const posts = ((rows ?? []) as Array<Post & { author: Profile }>).filter(
    (p) => !hiddenIds.has(p.id) && p.author,
  );
  if (posts.length === 0) return [];

  const ids = posts.map((p) => p.id);
  const [{ data: likes }, { data: comments }] = await Promise.all([
    supabase.from("post_likes").select("post_id, user_id").in("post_id", ids),
    supabase.from("comments").select("post_id").in("post_id", ids),
  ]);

  return posts.map((p) => {
    const postLikes = (likes ?? []).filter((l) => l.post_id === p.id);
    return {
      ...p,
      likes: postLikes.length,
      liked: postLikes.some((l) => l.user_id === meId),
      comments: (comments ?? []).filter((c) => c.post_id === p.id).length,
    };
  });
}

export type StoryGroup = { author: Profile; stories: Array<{ id: string; media_url: string; caption: string | null; created_at: string; expires_at: string }> };

export async function fetchStories(): Promise<StoryGroup[]> {
  const { data } = await supabase
    .from("stories")
    .select("*, author:profiles!stories_author_fkey(*)")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });

  const groups = new Map<string, StoryGroup>();
  for (const s of (data ?? []) as Array<{
    id: string;
    user_id: string;
    media_url: string;
    caption: string | null;
    created_at: string;
    expires_at: string;
    author: Profile;
  }>) {
    if (!s.author) continue;
    const g = groups.get(s.user_id) ?? { author: s.author, stories: [] };
    g.stories.push({
      id: s.id,
      media_url: s.media_url,
      caption: s.caption,
      created_at: s.created_at,
      expires_at: s.expires_at,
    });
    groups.set(s.user_id, g);
  }
  return [...groups.values()];
}

export async function fetchFriends(meId: string): Promise<Profile[]> {
  const { data } = await supabase
    .from("follows")
    .select("following:profiles!follows_following_profile_fkey(*)")
    .eq("follower_id", meId)
    .eq("status", "accepted");
  const friends = ((data ?? []) as Array<{ following: Profile }>)
    .map((r) => r.following)
    .filter(Boolean);
  if (friends.length > 0) return friends;

  // New account with nobody followed yet: suggest other chillers.
  const { data: others } = await supabase
    .from("profiles")
    .select("*")
    .neq("id", meId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (others ?? []) as Profile[];
}
