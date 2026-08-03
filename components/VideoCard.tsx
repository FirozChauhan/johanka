import Link from "next/link";
import type { Video } from "@/lib/types";
import { formatDuration, timeAgo } from "@/lib/format";
import { Thumb } from "./Thumb";
import { PlayIcon, ClockIcon } from "./icons";

/*
  A single video card used throughout the site. Thumbnail-first, minimal
  metadata, gentle hover states — no clutter.
*/
export function VideoCard({ video }: { video: Video }) {
  const href = `/watch/${video.id}`;
  const dur = formatDuration(video.duration);

  return (
    <Link
      href={href}
      className="group block focus:outline-none"
      aria-label={`Watch ${video.title}`}
    >
      <div className="relative aspect-video overflow-hidden bg-sunken ring-1 ring-line transition group-hover:ring-accent/40">
        <Thumb
          src={video.thumbnail}
          seed={video.id}
          className="h-full w-full"
          imgClassName="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />

        {/* duration badge */}
        {video.duration ? (
          <span className="absolute right-2 bottom-2 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            <ClockIcon className="h-3 w-3" />
            {dur}
          </span>
        ) : null}

        {/* hover play */}
        <div className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100">
          <span className="grid h-12 w-12 scale-90 place-items-center rounded-full bg-white text-black shadow-lg transition group-hover:scale-100">
            <PlayIcon className="ml-0.5 h-5 w-5" />
          </span>
        </div>
      </div>

      <div className="mt-2.5 space-y-0.5">
        <h3 className="line-clamp-1 text-sm font-medium text-fg">
          {video.title}
        </h3>
        <p className="text-xs text-faint">
          {timeAgo(video.created_at)}
          {video.size ? ` · ${video.size}` : ""}
        </p>
      </div>
    </Link>
  );
}
