import { NextRequest, NextResponse } from "next/server";
import { listFiles, embedUrl } from "@/lib/streamtape";
import type { StreamtapeCreds } from "@/lib/streamtape";
import { formatBytes, stripExt } from "@/lib/format";
import type { Video } from "@/lib/types";

/*
  GET /api/streamtape/files?login=...&key=...

  Stateless (no DB): the browser sends its stored credentials and we pull the
  account's file list straight from StreamTape's /file/listfolder. This is the
  single source of truth for the library — no localStorage video catalog.

  Results are cached in memory for a short TTL so repeated page loads don't
  hammer the StreamTape API.
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; videos: Video[] }>();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const creds: StreamtapeCreds = {
    streamtape_login: (searchParams.get("login") ?? "").trim(),
    streamtape_key: (searchParams.get("key") ?? "").trim(),
  };

  if (!creds.streamtape_login || !creds.streamtape_key) {
    return NextResponse.json({ configured: false, videos: [], error: "Not configured" });
  }

  const cacheKey = `${creds.streamtape_login}:${creds.streamtape_key}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ configured: true, videos: hit.videos, cached: true });
  }

  try {
    const files = await listFiles(creds);
    const videos: Video[] = files.map((f) => ({
      id: f.fileid,
      streamtape_id: f.fileid,
      title: prettyTitle(f.name),
      description: null,
      filename: f.name,
      size: f.size != null ? formatBytes(f.size) : null,
      duration: null,
      thumbnail: null,
      status: "ready",
      embed_url: embedUrl(f.fileid),
      direct_url: null,
      created_at: f.created ? f.created * 1000 : Date.now(),
    }));

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
