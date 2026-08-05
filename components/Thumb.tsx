"use client";

import { useState } from "react";
import { GradientThumb } from "./GradientThumb";

/*
  A thumbnail that falls back to a gradient placeholder when the image is
  missing or fails to load. Thumbnails come from StreamTape (/file/getsplash)
  and only exist once a video finishes processing, so this fallback keeps
  freshly-uploaded or still-converting videos looking clean instead of broken.
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
