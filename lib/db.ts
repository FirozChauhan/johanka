import { Pool } from "pg";
import type { AppSettings } from "./types";

/*
  Optional PostgreSQL store.

  Two things live here:
  1. App settings — the operator config (StreamTape creds, the folder id, the
     DSN itself) persisted server-side so it survives across browsers and
     incognito sessions (no more localStorage-only settings).
  2. Users — Google sign-in rows, persisted best-effort.

  Everything degrades gracefully: if no connection string is configured the
  settings simply fall back to env vars. The connection string can come from
  env (DATABASE_URL / POSTGRES_URL) or the /settings page.

  NOTE: video metadata is intentionally NOT stored here anymore — the library
  comes straight from StreamTape (see lib/streamtape.ts + /api/streamtape/files).
*/

// Cache one pool per distinct connection string so we don't rebuild pools on
// every request in the stateless, config-in-browser model.
const pools = new Map<string, Pool>();

export function getPool(connectionString: string): Pool {
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    });
    pools.set(connectionString, pool);
  }
  return pool;
}

/* --------------------------------- Settings --------------------------------- */

/*
  A single-row settings table. `id BOOLEAN PRIMARY KEY DEFAULT TRUE` enforces
  that there is exactly one row. Settings are the operator config that used to
  live only in browser localStorage; persisting them here makes the app behave
  the same in every browser, profile, and incognito window. Env vars still win
  at resolve time (see lib/settings.ts) but are not stored here.
*/

export async function ensureSettingsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id                        BOOLEAN PRIMARY KEY DEFAULT TRUE,
      streamtape_login          TEXT,
      streamtape_key            TEXT,
      streamtape_folder_id      TEXT,
      postgres_connection_string TEXT,
      admin_key_sha             TEXT,
      updated_at                BIGINT,
      CONSTRAINT settings_singleton CHECK (id = TRUE)
    );
  `);
  // Additive migration guards for databases created before a column existed.
  await pool.query(
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_key_sha TEXT`
  );
  await pool.query(
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS streamtape_folder_id TEXT`
  );
}

export async function loadSettingsFromDb(
  connectionString: string
): Promise<AppSettings> {
  const pool = getPool(connectionString);
  await ensureSettingsTable(pool);
  const res = await pool.query(`SELECT * FROM settings WHERE id = TRUE`);
  if (res.rows.length === 0) return {};
  const r = res.rows[0];
  return {
    streamtape_login: r.streamtape_login ?? undefined,
    streamtape_key: r.streamtape_key ?? undefined,
    streamtape_folder_id: r.streamtape_folder_id ?? undefined,
    postgres_connection_string: r.postgres_connection_string ?? undefined,
  };
}

export async function saveSettingsToDb(
  connectionString: string,
  settings: AppSettings
): Promise<void> {
  const pool = getPool(connectionString);
  await ensureSettingsTable(pool);
  await pool.query(
    `INSERT INTO settings
       (id, streamtape_login, streamtape_key, streamtape_folder_id,
        postgres_connection_string, updated_at)
     VALUES (TRUE, $1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET
       streamtape_login           = EXCLUDED.streamtape_login,
       streamtape_key             = EXCLUDED.streamtape_key,
       streamtape_folder_id       = EXCLUDED.streamtape_folder_id,
       postgres_connection_string = EXCLUDED.postgres_connection_string,
       updated_at                 = EXCLUDED.updated_at`,
    [
      settings.streamtape_login ?? null,
      settings.streamtape_key ?? null,
      settings.streamtape_folder_id ?? null,
      settings.postgres_connection_string ?? null,
      Math.floor(Date.now() / 1000),
    ]
  );
}

/** Return the stored SHA-256 of the admin key (hex), or null if none set. */
export async function getAdminKeySha(
  connectionString: string
): Promise<string | null> {
  const pool = getPool(connectionString);
  await ensureSettingsTable(pool);
  const res = await pool.query(`SELECT admin_key_sha FROM settings WHERE id = TRUE`);
  if (res.rows.length === 0) return null;
  return res.rows[0].admin_key_sha ?? null;
}

/** Store the SHA-256 of the admin key (single settings row). */
export async function setAdminKeySha(
  connectionString: string,
  shaHex: string
): Promise<void> {
  const pool = getPool(connectionString);
  await ensureSettingsTable(pool);
  await pool.query(
    `INSERT INTO settings (id, admin_key_sha) VALUES (TRUE, $1)
     ON CONFLICT (id) DO UPDATE SET admin_key_sha = EXCLUDED.admin_key_sha`,
    [shaHex]
  );
}

/* --------------------------------- Users --------------------------------- */

export interface DbUser {
  uid: string;
  email: string | null;
  display_name: string | null;
  photo_url: string | null;
  provider: string;
  created_at: number;
  last_login_at: number;
}

export async function ensureUsersTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      uid           TEXT PRIMARY KEY,
      email         TEXT,
      display_name  TEXT,
      photo_url     TEXT,
      provider      TEXT,
      created_at    BIGINT,
      last_login_at BIGINT,
      updated_at    BIGINT
    );
  `);
}

/**
 * Create (or update on re-login) a Google-authenticated user. The uid is the
 * Firebase Auth user id, which is stable and globally unique.
 */
export async function upsertUser(
  connectionString: string,
  user: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    provider?: string;
  }
): Promise<void> {
  const pool = getPool(connectionString);
  await ensureUsersTable(pool);
  const now = Date.now();
  await pool.query(
    `INSERT INTO users
       (uid, email, display_name, photo_url, provider, created_at, last_login_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (uid) DO UPDATE SET
       email         = EXCLUDED.email,
       display_name  = EXCLUDED.display_name,
       photo_url     = EXCLUDED.photo_url,
       provider      = EXCLUDED.provider,
       last_login_at = EXCLUDED.last_login_at,
       updated_at    = EXCLUDED.updated_at`,
    [
      user.uid,
      user.email ?? null,
      user.displayName ?? null,
      user.photoURL ?? null,
      user.provider ?? "google",
      now,
      now,
      now,
    ]
  );
}

export async function getUserByUid(
  connectionString: string,
  uid: string
): Promise<DbUser | null> {
  const pool = getPool(connectionString);
  await ensureUsersTable(pool);
  const res = await pool.query(`SELECT * FROM users WHERE uid = $1`, [uid]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    uid: r.uid,
    email: r.email ?? null,
    display_name: r.display_name ?? null,
    photo_url: r.photo_url ?? null,
    provider: r.provider ?? "google",
    created_at: Number(r.created_at),
    last_login_at: Number(r.last_login_at),
  };
}

