import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getAdminKeySha, loadSettingsFromDb, setAdminKeySha } from "./db";
import { resolveSettings } from "./settings";
import type { ResolvedSettings } from "./settings";
import type { AppSettings } from "./types";

/*
  Server-only settings + admin-key helpers.

  The streaming service is public, but the config (/settings) is private. The
  operator locks it with a long, random admin key. That key is stored in
  PostgreSQL as a SHA-256 hash (never plaintext), or — even better — set as the
  JOHANKA_ADMIN_KEY env var, which always wins and survives a fresh database.

  All data routes resolve credentials HERE (env wins over the DB) so the
  browser never holds or forwards secrets. Only the admin key unlocks the
  settings endpoints.
*/

export function envDsn(): string | undefined {
  return (process.env.DATABASE_URL || process.env.POSTGRES_URL)?.trim() || undefined;
}

/** Effective settings for the data routes: DB row overlaid with env vars. */
export async function loadEffectiveSettings(dsn?: string): Promise<ResolvedSettings> {
  const target = dsn ?? envDsn();
  let db: AppSettings = {};
  if (target) {
    try {
      db = await loadSettingsFromDb(target);
    } catch (err) {
      console.warn("[server-settings] DB read failed:", (err as Error).message);
    }
  }
  return resolveSettings(db);
}

/** Snake_case effective settings for the /api/settings response (env wins). */
export function overlayEnv(db: AppSettings): AppSettings {
  const pick = (env: string | undefined, fallback?: string): string | undefined => {
    const e = env?.trim();
    if (e) return e;
    const f = fallback?.trim();
    return f || undefined;
  };
  return {
    streamtape_login: pick(process.env.STREAMTAPE_LOGIN, db.streamtape_login),
    streamtape_key: pick(process.env.STREAMTAPE_KEY, db.streamtape_key),
    cloudinary_cloud_name: pick(
      process.env.CLOUDINARY_CLOUD_NAME,
      db.cloudinary_cloud_name
    ),
    cloudinary_api_key: pick(process.env.CLOUDINARY_API_KEY, db.cloudinary_api_key),
    cloudinary_api_secret: pick(
      process.env.CLOUDINARY_API_SECRET,
      db.cloudinary_api_secret
    ),
    postgres_connection_string: pick(
      process.env.DATABASE_URL || process.env.POSTGRES_URL,
      db.postgres_connection_string
    ),
  };
}

/* --------------------------------- Admin key --------------------------------- */

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function hashEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function envAdminKey(): string | undefined {
  return process.env.JOHANKA_ADMIN_KEY?.trim() || undefined;
}

export async function adminKeyConfigured(dsn?: string): Promise<boolean> {
  if (envAdminKey()) return true;
  const target = dsn ?? envDsn();
  if (!target) return false;
  try {
    return Boolean(await getAdminKeySha(target));
  } catch {
    return false;
  }
}

export async function adminTokenValid(token: string, dsn?: string): Promise<boolean> {
  if (!token) return false;
  const envKey = envAdminKey();
  if (envKey) return hashEqual(sha256Hex(token), sha256Hex(envKey));
  const target = dsn ?? envDsn();
  if (!target) return false;
  try {
    const stored = await getAdminKeySha(target);
    return stored ? hashEqual(sha256Hex(token), stored) : false;
  } catch {
    return false;
  }
}

export async function storeAdminKey(dsn: string, plain: string): Promise<void> {
  await setAdminKeySha(dsn, sha256Hex(plain));
}

/** Read the admin key from "Authorization: Bearer …" or a ?key= query param. */
export function adminTokenFromRequest(req: NextRequest): string {
  const auth = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m && m[1].trim()) return m[1].trim();
  return new URL(req.url).searchParams.get("key")?.trim() || "";
}

export async function isAdminRequest(req: NextRequest, dsn?: string): Promise<boolean> {
  return adminTokenValid(adminTokenFromRequest(req), dsn);
}