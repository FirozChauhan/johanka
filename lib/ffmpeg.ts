import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/*
  Extracts a poster frame from the uploaded video using ffmpeg (already
  available on the server). Falls back gracefully (returns null) if ffmpeg
  is missing so the app still works.

  The thumbnail is written to /public/thumbs/<id>.jpg and referenced by a
  public URL. Serving it from /public keeps things simple and self-hosted.
*/

const THUMBS_DIR = path.join(process.cwd(), "public", "thumbs");

function ensureDir() {
  fs.mkdirSync(THUMBS_DIR, { recursive: true });
}

/**
 * Extract a single frame ~1s into the video as a 16:9 JPEG poster.
 * Returns the public URL path (e.g. "/thumbs/abc.jpg") or null on failure.
 */
export async function generateThumbnail(
  sourcePath: string,
  id: string
): Promise<string | null> {
  ensureDir();
  const outPath = path.join(THUMBS_DIR, `${id}.jpg`);
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss", "00:00:01",
      "-i", sourcePath,
      "-vf", "scale=640:-2",
      "-frames:v", "1",
      "-update", "1", // newer ffmpeg needs this to write a single image to a fixed filename
      "-q:v", "4",
      outPath,
    ]);
    // Verify the file was actually written (ffmpeg can exit 0 yet write nothing
    // on some edge cases with newer image2 muxer behavior).
    if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
      console.error("[thumbnail] ffmpeg exited but produced no output file:", outPath);
      return null;
    }
    console.log("[thumbnail] generated:", outPath);
    return `/thumbs/${id}.jpg`;
  } catch (err) {
    console.error("[thumbnail] failed to generate:", (err as Error).message);
    return null;
  }
}

/** Optional: read a video's duration in seconds via ffprobe. Returns null on
 * any failure so callers can degrade gracefully. */
export async function probeDuration(sourcePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", sourcePath]
    );
    const seconds = parseFloat(stdout.trim());
    return Number.isFinite(seconds) ? seconds : null;
  } catch {
    return null;
  }
}

/**
 * Write an uploaded poster image (if provided) to the thumbs dir.
 * Returns the public URL path or null.
 */
export async function saveThumbnailImage(
  imageBuffer: Buffer,
  id: string,
  ext: string
): Promise<string | null> {
  ensureDir();
  const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
  const outPath = path.join(THUMBS_DIR, `${id}${safeExt}`);
  try {
    fs.writeFileSync(outPath, imageBuffer);
    return `/thumbs/${id}${safeExt}`;
  } catch (err) {
    console.error("[thumbnail] failed to save image:", (err as Error).message);
    return null;
  }
}
