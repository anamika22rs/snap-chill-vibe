ALTER TABLE public.hidden_posts ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT 'hidden';
CREATE UNIQUE INDEX IF NOT EXISTS hidden_posts_user_post_idx ON public.hidden_posts(user_id, post_id);

CREATE OR REPLACE FUNCTION public.my_blocked_accounts()
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, blocked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url, b.created_at
  FROM public.blocks b JOIN public.profiles p ON p.id = b.blocked_id
  WHERE b.blocker_id = auth.uid()
  ORDER BY b.created_at DESC
$$;
REVOKE EXECUTE ON FUNCTION public.my_blocked_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_blocked_accounts() TO authenticated;