"use client";

import { useState } from "react";
import { GradientThumb } from "./GradientThumb";

/*
  A thumbnail that falls back to a gradient placeholder when the image file is
  missing or fails to load. Render's filesystem is ephemeral — thumbnails in
  /public/thumbs are wiped on every redeploy/restart even though the video
  metadata (which lives in the browser) still references them. Without this
  fallback those stale references would render as broken images.
*/
export function Thumb({
  src,
  seed,
  className,
  imgClassName,
}: {
  src?: string | null;
  seed: string;
  className?: string;
  imgClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <GradientThumb seed={seed} className={className ?? imgClassName} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className={imgClassName ?? className}
      onError={() => setFailed(true)}
    />
  );
}
