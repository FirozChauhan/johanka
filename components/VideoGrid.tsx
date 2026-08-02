import type { Video } from "@/lib/types";
import { VideoCard } from "./VideoCard";

/*
  Responsive grid wrapper for cards. `compact` shrinks columns for rail
  layouts (e.g. related videos).
*/
export function VideoGrid({
  videos,
  compact = false,
}: {
  videos: Video[];
  compact?: boolean;
}) {
  if (videos.length === 0) {
    return (
      <p className="text-sm text-faint">
        Nothing here yet — upload your first video to get started.
      </p>
    );
  }
  return (
    <div
      className={
        "grid gap-x-4 gap-y-8 " +
        (compact
          ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")
      }
    >
      {videos.map((v) => (
        <VideoCard key={v.id} video={v} />
      ))}
    </div>
  );
}
