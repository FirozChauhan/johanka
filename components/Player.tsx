"use client";

import { useState } from "react";
import type { Video } from "@/lib/types";
import { Thumb } from "./Thumb";
import { PlayIcon } from "./icons";

/*
  Video player. StreamTape hosts the actual file, so we embed their player
  via iframe (free, no transcoding infra needed on our side) and layer a
  poster + play button over top for a clean, seamless look.
*/
export function Player({ video }: { video: Video }) {
  const [ready, setReady] = useState(false);

  // No embed URL (e.g. upload still processing / failed): show the poster as a
  // dimmed placeholder WITHOUT a misleading play button.
  if (!video.embed_url) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black ring-1 ring-line">
        <Thumb
          src={video.thumbnail}
          seed={video.id}
          className="h-full w-full opacity-40"
          imgClassName="h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 grid place-items-center bg-black/30 text-sm text-faint">
          No playable URL is available for this video yet.
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black ring-1 ring-line">
      {/* Embedded player is the base layer. */}
      <iframe
        src={video.embed_url}
        title={video.title}
        className="absolute inset-0 z-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        onLoad={() => setReady(true)}
      />

      {/* Poster layered ABOVE the player until it has loaded, so the seam is
          smooth. pointer-events-none keeps clicks/autoplay flowing through to
          the iframe instead of being swallowed by the overlay. */}
      {!ready && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <Thumb
            src={video.thumbnail}
            seed={video.id}
            className="h-full w-full opacity-60"
            imgClassName="h-full w-full object-cover opacity-70"
          />
          <div className="absolute inset-0 grid place-items-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-white/95 text-black shadow-2xl">
              <PlayIcon className="ml-1 h-7 w-7" />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
