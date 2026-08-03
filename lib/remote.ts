import type { Video } from "./types";

/**
 * Fetch the library straight from the StreamTape account through our server
 * (GET /api/streamtape/files). Returns [] when credentials aren't configured
 * or the request fails, so callers can fall back to the localStorage catalog.
 *
 * The server resolves credentials itself (env wins over the PostgreSQL
 * settings table) — the browser never sends or holds config.
 */
export async function fetchRemoteVideos(): Promise<Video[]> {
  try {
    const res = await fetch("/api/streamtape/files");
    const data = (await res.json()) as { videos?: Video[] };
    return Array.isArray(data.videos) ? data.videos : [];
  } catch {
    return [];
  }
}
