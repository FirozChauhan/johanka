import { FilmIcon } from "./icons";

/*
  A deterministic, tasteful placeholder used when a video has no poster.
  The gradient is derived from the string so the same video always shows
  the same colors (nice consistency without backend work).
*/

const GRADIENTS = [
  "linear-gradient(135deg,#3b2f5e 0%,#1d1b2e 100%)",
  "linear-gradient(135deg,#1f3a4d 0%,#12202b 100%)",
  "linear-gradient(135deg,#4a2b3a 0%,#221420 100%)",
  "linear-gradient(135deg,#27422e 0%,#152418 100%)",
  "linear-gradient(135deg,#4a3a22 0%,#241c10 100%)",
  "linear-gradient(135deg,#2f3f5e 0%,#181f30 100%)",
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function GradientThumb({
  seed,
  className = "",
}: {
  seed: string;
  className?: string;
}) {
  const g = GRADIENTS[hash(seed) % GRADIENTS.length];
  return (
    <div
      className={
        "flex items-center justify-center " + className
      }
      style={{ background: g }}
      aria-hidden
    >
      <FilmIcon className="h-8 w-8 text-white/15" />
    </div>
  );
}
