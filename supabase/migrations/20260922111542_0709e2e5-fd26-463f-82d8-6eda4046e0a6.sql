
-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  bio text,
  is_private boolean NOT NULL DEFAULT false,
  snap_score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.follows (
  follower_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'accepted',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- HELPERS
CREATE OR REPLACE FUNCTION public.is_blocked(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_user(target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN auth.uid() = target THEN true
    WHEN public.is_blocked(auth.uid(), target) THEN false
    WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = target AND p.is_private = false) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.follower_id = auth.uid() AND f.following_id = target AND f.status = 'accepted'
    )
  END
$$;

CREATE POLICY "profiles visible to signed in users" ON public.profiles FOR SELECT TO authenticated
  USING (NOT public.is_blocked(auth.uid(), id));
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "see own blocks" ON public.blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "create own blocks" ON public.blocks FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "remove own blocks" ON public.blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

CREATE POLICY "see relevant follows" ON public.follows FOR SELECT TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id OR status = 'accepted');
CREATE POLICY "follow as self" ON public.follows FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id AND NOT public.is_blocked(auth.uid(), following_id));
CREATE POLICY "unfollow own" ON public.follows FOR DELETE TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);
CREATE POLICY "accept requests" ON public.follows FOR UPDATE TO authenticated USING (auth.uid() = following_id);

-- POSTS / REELS
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'post',
  media_url text NOT NULL,
  caption text,
  location text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view allowed posts" ON public.posts FOR SELECT TO authenticated USING (public.can_view_user(user_id));
CREATE POLICY "create own posts" ON public.posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own posts" ON public.posts FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "update own posts" ON public.posts FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.post_likes (
  post_id uuid NOT NULL REFERENCES public.posts ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_likes TO authenticated;
GRANT ALL ON public.post_likes TO service_role;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view likes" ON public.post_likes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.can_view_user(p.user_id)));
CREATE POLICY "like as self" ON public.post_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "unlike own" ON public.post_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view comments" ON public.comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.can_view_user(p.user_id)));
CREATE POLICY "comment as self" ON public.comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own comments" ON public.comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.hidden_posts (
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hidden_posts TO authenticated;
GRANT ALL ON public.hidden_posts TO service_role;
ALTER TABLE public.hidden_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manage own hidden posts" ON public.hidden_posts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  target_user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  target_post_id uuid REFERENCES public.posts ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "see own reports" ON public.reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
CREATE POLICY "report as self" ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

-- STORIES
CREATE TABLE public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  media_url text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT ALL ON public.stories TO service_role;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view allowed stories" ON public.stories FOR SELECT TO authenticated
  USING (public.can_view_user(user_id) AND expires_at > now());
CREATE POLICY "create own stories" ON public.stories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own stories" ON public.stories FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- SNAPS
CREATE TABLE public.snaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  media_url text,
  caption text,
  filter text,
  opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.snaps TO authenticated;
GRANT ALL ON public.snaps TO service_role;
ALTER TABLE public.snaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own snaps" ON public.snaps FOR SELECT TO authenticated
  USING ((auth.uid() = sender_id OR auth.uid() = recipient_id) AND expires_at > now());
CREATE POLICY "send snaps" ON public.snaps FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND NOT public.is_blocked(auth.uid(), recipient_id));
CREATE POLICY "open received snaps" ON public.snaps FOR UPDATE TO authenticated USING (auth.uid() = recipient_id);
CREATE POLICY "delete own snaps" ON public.snaps FOR DELETE TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE TABLE public.streaks (
  user_a uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  count integer NOT NULL DEFAULT 1,
  last_snap_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.streaks TO authenticated;
GRANT ALL ON public.streaks TO service_role;
ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own streaks" ON public.streaks FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE OR REPLACE FUNCTION public.bump_streak()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a uuid; b uuid;
BEGIN
  a := LEAST(NEW.sender_id, NEW.recipient_id);
  b := GREATEST(NEW.sender_id, NEW.recipient_id);
  INSERT INTO public.streaks (user_a, user_b, count, last_snap_at)
  VALUES (a, b, 1, now())
  ON CONFLICT (user_a, user_b) DO UPDATE
    SET count = CASE
          WHEN public.streaks.last_snap_at < now() - interval '48 hours' THEN 1
          WHEN public.streaks.last_snap_at < now() - interval '20 hours' THEN public.streaks.count + 1
          ELSE public.streaks.count
        END,
        last_snap_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER snaps_bump_streak AFTER INSERT ON public.snaps
FOR EACH ROW EXECUTE FUNCTION public.bump_streak();

-- CHAT
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own messages" ON public.messages FOR SELECT TO authenticated
  USING ((auth.uid() = sender_id OR auth.uid() = recipient_id) AND expires_at > now());
CREATE POLICY "send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND NOT public.is_blocked(auth.uid(), recipient_id));
CREATE POLICY "mark read" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = recipient_id);
CREATE POLICY "delete own messages" ON public.messages FOR DELETE TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- SNAP MAP
CREATE TABLE public.snap_locations (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  place text,
  sharing boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.snap_locations TO authenticated;
GRANT ALL ON public.snap_locations TO service_role;
ALTER TABLE public.snap_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view allowed locations" ON public.snap_locations FOR SELECT TO authenticated
  USING (sharing AND public.can_view_user(user_id));
CREATE POLICY "manage own location" ON public.snap_locations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.snaps;
