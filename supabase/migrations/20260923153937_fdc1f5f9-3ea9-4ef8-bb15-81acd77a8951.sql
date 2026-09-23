
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text;

-- Chat history should persist.
ALTER TABLE public.messages ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE public.messages ALTER COLUMN expires_at DROP DEFAULT;
UPDATE public.messages SET expires_at = NULL;
DROP POLICY IF EXISTS "view own messages" ON public.messages;
CREATE POLICY "view own messages" ON public.messages FOR SELECT TO authenticated
USING (((auth.uid() = sender_id) OR (auth.uid() = recipient_id)) AND (expires_at IS NULL OR expires_at > now()));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_url text;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_actor_profile_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.notify_like() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
  SELECT user_id INTO owner FROM public.posts WHERE id = NEW.post_id;
  IF owner IS NOT NULL AND owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id)
    VALUES (owner, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
  SELECT user_id INTO owner FROM public.posts WHERE id = NEW.post_id;
  IF owner IS NOT NULL AND owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id)
    VALUES (owner, NEW.user_id, 'comment', NEW.post_id);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_follow() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, type)
  VALUES (NEW.following_id, NEW.follower_id,
    CASE WHEN NEW.status = 'accepted' THEN 'follow' ELSE 'follow_request' END);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS post_likes_notify ON public.post_likes;
CREATE TRIGGER post_likes_notify AFTER INSERT ON public.post_likes FOR EACH ROW EXECUTE FUNCTION public.notify_like();
DROP TRIGGER IF EXISTS comments_notify ON public.comments;
CREATE TRIGGER comments_notify AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.notify_comment();
DROP TRIGGER IF EXISTS follows_notify ON public.follows;
CREATE TRIGGER follows_notify AFTER INSERT ON public.follows FOR EACH ROW EXECUTE FUNCTION public.notify_follow();

REVOKE EXECUTE ON FUNCTION public.notify_like() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_comment() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_follow() FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ringing',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.calls
  ADD CONSTRAINT calls_caller_profile_fkey FOREIGN KEY (caller_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT calls_callee_profile_fkey FOREIGN KEY (callee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own calls" ON public.calls FOR SELECT TO authenticated USING (auth.uid() = caller_id OR auth.uid() = callee_id);
CREATE POLICY "start calls" ON public.calls FOR INSERT TO authenticated WITH CHECK (auth.uid() = caller_id AND NOT public.is_blocked(auth.uid(), callee_id));
CREATE POLICY "update own calls" ON public.calls FOR UPDATE TO authenticated USING (auth.uid() = caller_id OR auth.uid() = callee_id);
CREATE POLICY "delete own calls" ON public.calls FOR DELETE TO authenticated USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "create own tickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "see own tickets" ON public.support_tickets FOR SELECT TO authenticated USING (auth.uid() = user_id);
