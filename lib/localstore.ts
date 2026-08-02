// Client-side persistence backed by browser localStorage.
//
// This replaces SQLite for a "get it working now" demo: every bit of app data
// (video metadata + StreamTape credentials) lives in the browser, so there is
// NO server-side database and nothing to configure/deploy for storage.
//
// Caveats (intentional for now):
//   - Data is per-browser and per-device, and is lost if the user clears
//     site data. It is NOT shared between visitors.
//   - Server-rendered output can't read localStorage, so pages that show
//     stored data are client components that load it in an effect.

import type { AppSettings, Video } from "./types";

const VIDEOS_KEY = "johanka:videos";
const SETTINGS_KEY = "johanka:settings";
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

/* ---------------------------- Settings ---------------------------- */

export function getStoredSettings(): AppSettings {
  if (!canStore()) return {};
  return safeParse<AppSettings>(localStorage.getItem(SETTINGS_KEY), {});
}

export function saveStoredSettings(settings: AppSettings): void {
  if (!canStore()) return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
