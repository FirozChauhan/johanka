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

/** App-level settings stored in the browser (and mirrored via env on the server). */
export interface AppSettings {
  streamtape_login?: string;
  streamtape_key?: string;
  /** Cloudinary cloud name / public cloud id. */
  cloudinary_cloud_name?: string;
  cloudinary_api_key?: string;
  cloudinary_api_secret?: string;
  /** Optional PostgreSQL connection string. Persists /settings config and
   * enriches the catalog. */
  postgres_connection_string?: string;
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

/**
 * A signed-in user, as seen by the client. `guest` marks a skipped-auth
 * visit that is NOT persisted to the database.
 */
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: string;
  /** True when the visitor chose "continue as guest" and has no account. */
  guest?: boolean;
  /** Random id assigned to a guest visit. */
  guestId?: string;
}

