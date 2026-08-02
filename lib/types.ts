// Shared TypeScript types used across the app.

export type VideoStatus = "ready" | "processing" | "error";

export interface Video {
  /** Random public id (slug) */
  id: string;
  /** StreamTape file id */
  streamtape_id: string | null;
  title: string;
  description: string | null;
  /** Original file name as uploaded */
  filename: string | null;
  /** Human-friendly file size */
  size: string | null;
  /** Duration in seconds, if known */
  duration: number | null;
  /** Poster / thumbnail image URL (relative path to /public) */
  thumbnail: string | null;
  status: VideoStatus;
  /** StreamTape iframe embed URL */
  embed_url: string | null;
  /** Most recently resolved direct mp4 URL (may expire) */
  direct_url: string | null;
  /** Unix ms timestamp */
  created_at: number;
}

/** App-level settings stored in the database (see lib/settings.ts). */
export interface AppSettings {
  streamtape_login?: string;
  streamtape_key?: string;
}

export interface VideoDraft {
  title: string;
  description?: string;
}

/** Result returned by the StreamTape client for an upload. */
export interface UploadOutcome {
  streamtapeId: string;
  embedUrl: string;
  filename: string;
}
