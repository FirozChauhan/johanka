"use client";

import Link from "next/link";
import type { Video } from "@/lib/types";
import { formatDuration, timeAgo } from "@/lib/format";
import { Thumb } from "./Thumb";
import { PlayIcon, ClockIcon } from "./icons";

/*
  A cinematic "featured" hero pinned above the library grid. Renders the newest
  video as a full-bleed poster backdrop with a gradient scrim so the overlay
  text stays legible, plus a primary play action. Keeps the clean, flat look —
  no rounded corners, dark base, violet accent.
*/
export function HeroVideo({ video }: { video: Video }) {
  const href = `/watch/${video.id}`;

  return (
    <Link
      href={href}
      aria-label={`Play ${video.title}`}
      className="group relative block overflow-hidden bg-sunken ring-1 ring-line transition focus:outline-none hover:ring-accent/40"
    >
      {/* Poster backdrop */}
      <Thumb
        src={video.thumbnail}
        seed={video.id}
        className="absolute inset-0"
        imgClassName="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
      />

      {/* Legibility scrims — dark from the left for text, top for balance */}
      <div className="absolute inset-0 bg-gradient-to-r from-base via-base/70 to-base/5" />
      <div className="absolute inset-0 bg-gradient-to-t from-base via-transparent to-base/40" />

      {/* Content */}
      <div className="relative z-10 flex min-h-[250px] flex-col justify-end px-5 py-6 sm:min-h-[320px] sm:px-8 sm:py-8 lg:min-h-[360px]">
        <span className="mb-3 inline-flex w-fit items-center gap-1.5 border border-line-soft bg-base/60 px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted backdrop-blur">
          <PlayIcon className="h-3 w-3 text-accent" />
          Featured
        </span>

        <h2 className="max-w-2xl text-2xl leading-tight font-semibold tracking-tight text-fg sm:text-3xl lg:text-4xl">
          {video.title}
        </h2>

        {video.description && (
          <p className="mt-2 line-clamp-2 max-w-xl text-sm text-muted sm:max-w-2xl sm:text-[15px]">
            {video.description}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <span className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-accent-strong">
            <PlayIcon className="h-4 w-4" />
            Watch now
          </span>

          <span className="inline-flex items-center gap-1.5 text-xs text-faint">
            <ClockIcon className="h-3.5 w-3.5" />
            {formatDuration(video.duration)}
          </span>
          <span className="text-xs text-faint">{timeAgo(video.created_at)}</span>
          {video.size ? <span className="text-xs text-faint">· {video.size}</span> : null}
        </div>
      </div>
    </Link>
  );
}
