import { useNavigate, useRouter } from "@tanstack/react-router";

/** Go back exactly one step; if there is no in-app history, replace with a fallback page. */
export function useBack(fallback: string) {
  const router = useRouter();
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { __TSR_index?: number } | null)?.__TSR_index ?? 0;
    if (idx > 0) router.history.back();
    else navigate({ to: fallback, replace: true });
  };
}
