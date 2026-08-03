"use client";

import { getStoredSettings } from "./localstore";
import type { AppSettings } from "./types";

/*
  Client access to the server-persisted settings (PostgreSQL).

  Before, every page read StreamTape/Cloudinary config straight from
  localStorage, which is per-browser and wiped in incognito. Now the /settings
  page saves to the server and pages pull the effective settings back here.

  The results are cached in memory for a single page-load so the stateless API
  routes can be called with the stored credentials. Env vars on the server win
  over saved values, so this reflects whatever is actually active.
*/

let cached: AppSettings | null = null;
let inflight: Promise<AppSettings> | null = null;

/**
 * Bootstrap DSN: lets the server reach the settings table even when it isn't
 * in env. The /settings page mirrors the DSN to localStorage on save; for a
 * brand-new (incognito) browser this only works if DATABASE_URL is set in env.
 */
function bootstrapDsn(): string {
  return getStoredSettings().postgres_connection_string || "";
}

export async function fetchSettings(force = false): Promise<AppSettings> {
  if (cached && !force) return cached;
  if (!inflight) {
    inflight = (async () => {
      const dsn = bootstrapDsn();
      const qs = dsn ? `?postgres=${encodeURIComponent(dsn)}` : "";
      try {
        const res = await fetch(`/api/settings${qs}`, { cache: "no-store" });
        const data = (await res.json()) as { settings?: AppSettings };
        cached = data.settings ?? {};
      } catch {
        cached = {};
      } finally {
        inflight = null;
      }
      return cached;
    })();
  }
  return inflight;
}

export function clearSettingsCache(): void {
  cached = null;
}
