ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.has_chat_with(target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.messages m
    WHERE (m.sender_id = auth.uid() AND m.recipient_id = target)
       OR (m.sender_id = target AND m.recipient_id = auth.uid()))
$$;
REVOKE EXECUTE ON FUNCTION public.has_chat_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_chat_with(uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles visible to signed in users" ON public.profiles;
CREATE POLICY "profiles visible to signed in users" ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR (NOT public.is_blocked(auth.uid(), id) AND (is_hidden = false OR public.has_chat_with(id)))
);

-- Messages: edit / soft delete
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE TABLE public.message_hides (
  user_id uuid NOT NULL,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);
GRANT SELECT, INSERT, DELETE ON public.message_hides TO authenticated;
GRANT ALL ON public.message_hides TO service_role;
ALTER TABLE public.message_hides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own hides read" ON public.message_hides FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own hides insert" ON public.message_hides FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND (m.sender_id = auth.uid() OR m.recipient_id = auth.uid())));
CREATE POLICY "own hides delete" ON public.message_hides FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "mark read" ON public.messages;
DROP POLICY IF EXISTS "delete own messages" ON public.messages;
CREATE POLICY "participants update" ON public.messages FOR UPDATE TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = recipient_id)
WITH CHECK (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE OR REPLACE FUNCTION public.guard_message_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.sender_id <> OLD.sender_id OR NEW.recipient_id <> OLD.recipient_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'cannot change message participants';
  END IF;
  IF OLD.deleted_at IS NOT NULL AND (NEW.body <> OLD.body OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
    RAISE EXCEPTION 'message was deleted';
  END IF;
  IF auth.uid() = OLD.recipient_id AND auth.uid() <> OLD.sender_id THEN
    IF NEW.body <> OLD.body OR NEW.edited_at IS DISTINCT FROM OLD.edited_at
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.media_url IS DISTINCT FROM OLD.media_url THEN
      RAISE EXCEPTION 'only the sender can edit or delete this message';
    END IF;
  ELSIF auth.uid() = OLD.sender_id THEN
    IF NEW.read_at IS DISTINCT FROM OLD.read_at AND OLD.sender_id <> OLD.recipient_id THEN
      NEW.read_at := OLD.read_at;
    END IF;
    IF NEW.deleted_at IS NOT NULL THEN
      NEW.body := ''; NEW.media_url := NULL;
    ELSIF NEW.body <> OLD.body THEN
      IF length(trim(NEW.body)) = 0 THEN RAISE EXCEPTION 'empty message'; END IF;
      NEW.edited_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER messages_guard_update BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.guard_message_update();