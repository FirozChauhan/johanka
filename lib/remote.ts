import { getStoredSettings } from "./localstore";
import type { Video } from "./types";

/** Credential query string for the stateless API routes. */
export function credsQuery(): string {
  const s = getStoredSettings();
  const p = new URLSearchParams();
  p.set("login", s.streamtape_login || "");
  p.set("key", s.streamtape_key || "");
  p.set("postgres", s.postgres_connection_string || "");
  return p.toString();
}

/**
 * Fetch the library straight from the StreamTape account through our server
 * (GET /api/streamtape/files). Returns [] when credentials aren't configured
 * or the request fails, so callers can fall back to the localStorage catalog.
 */
export async function fetchRemoteVideos(): Promise<Video[]> {
  try {
    const res = await fetch(`/api/streamtape/files?${credsQuery()}`);
    const data = (await res.json()) as { videos?: Video[] };
    return Array.isArray(data.videos) ? data.videos : [];
  } catch {
    return [];
  }
}
