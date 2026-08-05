import { NextResponse } from "next/server";
import { listFiles, embedUrl, getThumbnailUrl } from "@/lib/streamtape";
import type { StreamtapeCreds } from "@/lib/streamtape";
import { formatBytes, stripExt } from "@/lib/format";
import type { Video } from "@/lib/types";
import { loadEffectiveSettings } from "@/lib/server-settings";

/*
  GET /api/streamtape/files

  PUBLIC: lists the library straight from the StreamTape account. When a
  StreamTape folder id is configured (settings / STREAMTAPE_FOLDER_ID env),
  only that folder's files are listed. Credentials are resolved server-side
  (env vars win over the PostgreSQL settings table), so the browser never
  holds config and the page is identical for every visitor.

  Video metadata is NOT stored in a database — everything comes directly from
  StreamTape (name, size, created date, thumbnail). Results are cached in
  memory for a short TTL so repeated page loads don't hammer the API.
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; videos: Video[] }>();

/*
  Thumbnails come from StreamTape (GET /file/getsplash) and only exist once the
  video has finished processing, so they change rarely. Cache resolved splash
  URLs module-wide for 10 minutes (2 minutes for failures) so the 30s listing
  cache doesn't re-ask StreamTape for every file on every refresh.
*/
const SPLASH_OK_TTL_MS = 10 * 60_000;
const SPLASH_NULL_TTL_MS = 2 * 60_000;
const splashCache = new Map<string, { at: number; url: string | null }>();

/**
 * Resolve StreamTape's auto-generated thumbnail for each file id, with a small
 * concurrency cap so a big library doesn't burst the API. Failures degrade to
 * null — the UI falls back to a gradient placeholder.
 */
async function resolveThumbnails(
  creds: StreamtapeCreds,
  ids: string[],
  concurrency = 5
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  let i = 0;

  async function worker() {
    while (i < ids.length) {
      const id = ids[i++];
      const cached = splashCache.get(id);
      // Cache nulls (thumbnail not ready yet) for less time than successes so
      // a still-processing video picks up its poster sooner.
      if (cached) {
        const ttl = cached.url === null ? SPLASH_NULL_TTL_MS : SPLASH_OK_TTL_MS;
        if (Date.now() - cached.at < ttl) {
          out.set(id, cached.url);
          continue;
        }
      }
      const url = await getThumbnailUrl(creds, id);
      splashCache.set(id, { at: Date.now(), url });
      out.set(id, url);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(ids.length, 1)) }, worker));
  return out;
}

export async function GET() {
  const settings = await loadEffectiveSettings();
  const creds: StreamtapeCreds = {
    streamtape_login: settings.streamtape_login,
    streamtape_key: settings.streamtape_key,
  };

  if (!creds.streamtape_login || !creds.streamtape_key) {
    return NextResponse.json({ configured: false, videos: [], error: "Not configured" });
  }

  // Optional Postgres enrichment (env vars win over the /settings value).
  const postgresDsn = settings.postgresConnectionString;

  const cacheKey = `${creds.streamtape_login}:${creds.streamtape_key}:${settings.streamtapeFolderId ?? ""}:${postgresDsn ?? ""}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ configured: true, videos: hit.videos, cached: true });
  }

  try {
    const files = await listFiles(creds, settings.streamtapeFolderId);

    // Thumbnails: StreamTape generates a poster after processing, so resolve
    // the splash URL for every file (cached). This is the only thumb source.
    const thumbs = await resolveThumbnails(creds, files.map((f) => f.fileid));

    const videos: Video[] = files.map((f) => {
      return {
        id: f.fileid,
        streamtape_id: f.fileid,
        title: prettyTitle(f.name),
        description: null,
        filename: f.name,
        size: f.size != null ? formatBytes(f.size) : null,
        duration: null,
        thumbnail: thumbs.get(f.fileid) ?? null,
        status: "ready",
        embed_url: embedUrl(f.fileid),
        direct_url: null,
        created_at: f.created ? f.created * 1000 : Date.now(),
      };
    });

    cache.set(cacheKey, { at: Date.now(), videos });
    return NextResponse.json({ configured: true, videos, cached: false });
  } catch (err) {
    return NextResponse.json(
      {
        configured: true,
        videos: [],
        error: err instanceof Error ? err.message : "Failed to list StreamTape files.",
      },
      { status: 502 }
    );
  }
}

/** "my_movie.mp4" / "My-Movie.mp4" -> "My movie". */
function prettyTitle(name: string): string {
  const base = stripExt(name);
  const cleaned = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || name;
}
