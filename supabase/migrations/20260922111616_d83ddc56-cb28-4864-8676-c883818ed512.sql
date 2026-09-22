
REVOKE EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bump_streak() FROM anon, authenticated;
