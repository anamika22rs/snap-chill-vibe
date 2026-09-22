import { useQuery } from "@tanstack/react-query";
import { resolveMedia } from "@/lib/chill";
import { cn } from "@/lib/utils";

export function Media({
  path,
  className,
  filterClassName,
  alt = "",
}: {
  path: string | null | undefined;
  className?: string;
  filterClassName?: string;
  alt?: string;
}) {
  const { data } = useQuery({
    queryKey: ["media", path],
    enabled: !!path,
    staleTime: 60 * 60 * 1000,
    queryFn: () => resolveMedia(path!),
  });

  if (!path || !data) {
    return <div className={cn("animate-pulse bg-muted", className)} />;
  }
  return <img src={data} alt={alt} loading="lazy" className={cn(className, filterClassName)} />;
}
