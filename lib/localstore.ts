// Client-side persistence backed by browser localStorage.
//
// This is a fallback/offline layer: it stores ONLY the video catalog fallback
// (for when no StreamTape credentials are configured or the remote fetch
// fails). App settings (StreamTape / the Postgres DSN) and the admin key are
// handled server-side (PostgreSQL via /api/settings) and never touch
// localStorage.
//
// Caveats (intentional): localStorage is per-browser and per-device, and is
// lost if the user clears site data. Server-rendered output can't read it, so
// pages that show stored data are client components that load it in an effect.

import type { Video } from "./types";

const VIDEOS_KEY = "johanka:videos";
export const HISTORY_KEY = "johanka:history";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Guard: no `window` during SSR / on the server. */
function canStore(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/* ----------------------------- Videos ----------------------------- */

export function getStoredVideos(): Video[] {
  if (!canStore()) return [];
  return safeParse<Video[]>(localStorage.getItem(VIDEOS_KEY), []);
}

export function saveStoredVideos(videos: Video[]): void {
  if (!canStore()) return;
  try {
    localStorage.setItem(VIDEOS_KEY, JSON.stringify(videos));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function getStoredVideo(id: string): Video | null {
  return getStoredVideos().find((v) => v.id === id) ?? null;
}

/** Insert a new video at the top, or update it in place if it exists. */
export function upsertStoredVideo(video: Video): void {
  const list = getStoredVideos();
  const idx = list.findIndex((v) => v.id === video.id);
  if (idx >= 0) list[idx] = video;
  else list.unshift(video);
  saveStoredVideos(list);
}

export function removeStoredVideo(id: string): void {
  saveStoredVideos(getStoredVideos().filter((v) => v.id !== id));
}
