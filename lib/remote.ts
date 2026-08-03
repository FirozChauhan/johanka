import { fetchSettings } from "./client-settings";
import type { AppSettings, Video } from "./types";

/** Credential query string for the stateless API routes. */
export function credsQuery(settings: AppSettings): string {
  const p = new URLSearchParams();
  p.set("login", settings.streamtape_login || "");
  p.set("key", settings.streamtape_key || "");
  p.set("postgres", settings.postgres_connection_string || "");
  return p.toString();
}

/**
 * Fetch the library straight from the StreamTape account through our server
 * (GET /api/streamtape/files). Returns [] when credentials aren't configured
 * or the request fails, so callers can fall back to the localStorage catalog.
 *
 * Credentials come from the server-persisted settings (PostgreSQL), not
 * localStorage, so the library looks the same in every browser.
 */
export async function fetchRemoteVideos(): Promise<Video[]> {
  try {
    const settings = await fetchSettings();
    const res = await fetch(`/api/streamtape/files?${credsQuery(settings)}`);
    const data = (await res.json()) as { videos?: Video[] };
    return Array.isArray(data.videos) ? data.videos : [];
  } catch {
    return [];
  }
}
