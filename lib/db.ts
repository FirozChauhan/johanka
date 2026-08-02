import { Pool } from "pg";

/*
  Optional PostgreSQL catalog for enriched metadata (posters, descriptions,
  durations) keyed by StreamTape file id.

  Everything here degrades gracefully: if no connection string is configured
  the app simply falls back to the raw StreamTape listing. The connection
  string can come from env (DATABASE_URL / POSTGRES_URL) or the /settings page.
*/

export interface DbVideoMeta {
  streamtape_id: string;
  title?: string | null;
  description?: string | null;
  duration_secs?: number | null;
  poster_url?: string | null;
}

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

export async function ensureVideosTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS videos (
      streamtape_id    TEXT PRIMARY KEY,
      title            TEXT,
      description      TEXT,
      filename         TEXT,
      size_bytes       BIGINT,
      created_at       BIGINT,
      duration_secs    INTEGER,
      poster_url       TEXT,
      poster_public_id TEXT,
      updated_at       BIGINT
    );
  `);
}

export interface VideoUpsert {
  streamtape_id: string;
  title?: string | null;
  description?: string | null;
  filename?: string | null;
  size_bytes?: number | null;
  duration_secs?: number | null;
  poster_url?: string | null;
  poster_public_id?: string | null;
}

export async function upsertVideo(
  connectionString: string,
  meta: VideoUpsert
): Promise<void> {
  const pool = getPool(connectionString);
  await ensureVideosTable(pool);
  await pool.query(
    `INSERT INTO videos
       (streamtape_id, title, description, filename, size_bytes, duration_secs,
        poster_url, poster_public_id, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (streamtape_id) DO UPDATE SET
       title            = EXCLUDED.title,
       description      = EXCLUDED.description,
       filename         = EXCLUDED.filename,
       size_bytes       = EXCLUDED.size_bytes,
       duration_secs    = EXCLUDED.duration_secs,
       poster_url       = EXCLUDED.poster_url,
       poster_public_id = EXCLUDED.poster_public_id,
       updated_at       = EXCLUDED.updated_at`,
    [
      meta.streamtape_id,
      meta.title ?? null,
      meta.description ?? null,
      meta.filename ?? null,
      meta.size_bytes ?? null,
      meta.duration_secs ?? null,
      meta.poster_url ?? null,
      meta.poster_public_id ?? null,
      Math.floor(Date.now() / 1000),
    ]
  );
}

export async function fetchVideosMeta(
  connectionString: string,
  ids: string[]
): Promise<Map<string, DbVideoMeta>> {
  const pool = getPool(connectionString);
  await ensureVideosTable(pool);
  const out = new Map<string, DbVideoMeta>();
  if (ids.length === 0) return out;
  const res = await pool.query(
    `SELECT streamtape_id, title, description, duration_secs, poster_url
     FROM videos WHERE streamtape_id = ANY($1::text[])`,
    [ids]
  );
  for (const row of res.rows) {
    out.set(row.streamtape_id, {
      streamtape_id: row.streamtape_id,
      title: row.title,
      description: row.description,
      duration_secs: row.duration_secs,
      poster_url: row.poster_url,
    });
  }
  return out;
}
