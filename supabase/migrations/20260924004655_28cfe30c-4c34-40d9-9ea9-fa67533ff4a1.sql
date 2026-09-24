ALTER TABLE public.stories ADD COLUMN visibility text NOT NULL DEFAULT 'public';
CREATE OR REPLACE FUNCTION public.validate_story_visibility() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF NEW.visibility NOT IN ('public','selected','close_friends') THEN RAISE EXCEPTION 'invalid visibility'; END IF; RETURN NEW; END $$;
CREATE TRIGGER stories_visibility_check BEFORE INSERT OR UPDATE ON public.stories FOR EACH ROW EXECUTE FUNCTION public.validate_story_visibility();

CREATE TABLE public.close_friends (
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, friend_id));
GRANT SELECT, INSERT, DELETE ON public.close_friends TO authenticated;
GRANT ALL ON public.close_friends TO service_role;
ALTER TABLE public.close_friends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manage own close friends" ON public.close_friends FOR ALL TO authenticated USING (auth.uid()=owner_id) WITH CHECK (auth.uid()=owner_id);

CREATE TABLE public.story_viewers (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, viewer_id));
GRANT SELECT, INSERT, DELETE ON public.story_viewers TO authenticated;
GRANT ALL ON public.story_viewers TO service_role;
ALTER TABLE public.story_viewers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.owns_story(_story uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.stories WHERE id=_story AND user_id=auth.uid()) $$;
CREATE POLICY "owner manages story viewers" ON public.story_viewers FOR ALL TO authenticated USING (public.owns_story(story_id)) WITH CHECK (public.owns_story(story_id));
CREATE POLICY "viewer sees own grant" ON public.story_viewers FOR SELECT TO authenticated USING (viewer_id=auth.uid());

CREATE OR REPLACE FUNCTION public.can_view_story(_story uuid, _owner uuid, _vis text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN auth.uid() = _owner THEN true
    WHEN public.is_blocked(auth.uid(), _owner) THEN false
    WHEN _vis = 'public' THEN true
    WHEN _vis = 'selected' THEN EXISTS (SELECT 1 FROM public.story_viewers WHERE story_id=_story AND viewer_id=auth.uid())
    WHEN _vis = 'close_friends' THEN EXISTS (SELECT 1 FROM public.close_friends WHERE owner_id=_owner AND friend_id=auth.uid())
    ELSE false END $$;
REVOKE EXECUTE ON FUNCTION public.can_view_story(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_story(uuid,uuid,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.owns_story(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_story(uuid) TO authenticated;

DROP POLICY "view allowed stories" ON public.stories;
CREATE POLICY "view allowed stories" ON public.stories FOR SELECT TO authenticated USING (expires_at > now() AND public.can_view_story(id, user_id, visibility));

-- chat notifications
CREATE OR REPLACE FUNCTION public.notify_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN INSERT INTO public.notifications (user_id, actor_id, type) VALUES (NEW.recipient_id, NEW.sender_id, 'message'); RETURN NEW; END $$;
REVOKE EXECUTE ON FUNCTION public.notify_message() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER messages_notify AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_message();

-- username availability for signup (anon)
CREATE OR REPLACE FUNCTION public.username_available(_username text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username)=lower(_username)) $$;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.raw_user_meta_data ? 'username' THEN
    INSERT INTO public.profiles (id, username, display_name, status)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'status')
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (lower(username));