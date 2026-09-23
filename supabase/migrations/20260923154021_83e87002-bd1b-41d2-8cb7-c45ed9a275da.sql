
REVOKE EXECUTE ON FUNCTION public.notify_like() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_comment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_follow() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_streak() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_user(uuid) TO authenticated;
