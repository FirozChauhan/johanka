import { NextRequest, NextResponse } from "next/server";
import { loadSettingsFromDb, saveSettingsToDb } from "@/lib/db";
import type { AppSettings } from "@/lib/types";

/*
  GET  /api/settings?postgres=...bootstrap-dsn...
  POST /api/settings

  Server-side settings persistence. Settings are stored in the PostgreSQL
  `settings` table so they survive across browsers, profiles, and incognito
  windows (previously they lived only in browser localStorage).

  The connection string that HOSTS the settings table is resolved as:
    1. env DATABASE_URL / POSTGRES_URL   (recommended — required for
       persistence in a browser that has never seen localStorage)
    2. the `postgres` query param         (bootstrap DSN the /settings UI
       may save so a previously UI-configured install keeps working)

  Env vars (STREAMTAPE_*, CLOUDINARY_*, DATABASE_URL) always win over values
  stored in the database, matching lib/settings.ts.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pick(env: string | undefined, fallback?: string): string | undefined {
  const fromEnv = env?.trim();
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  const fromFallback = fallback?.trim();
  return fromFallback || undefined;
}

/** Effective settings = DB row overlaid with env vars. */
function effectiveSettings(db: AppSettings): AppSettings {
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

/** Resolve which PostgreSQL instance holds the settings table. */
function settingsDsn(
  client?: string | undefined,
  queryDsn?: string | undefined
): string | undefined {
  const fromEnv = (process.env.DATABASE_URL || process.env.POSTGRES_URL)?.trim();
  if (fromEnv) return fromEnv;
  const fromClient = client?.trim();
  if (fromClient) return fromClient;
  const fromQuery = queryDsn?.trim();
  return fromQuery || undefined;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dsn = settingsDsn(undefined, searchParams.get("postgres") ?? undefined);

  if (!dsn) {
    // No Postgres configured yet — only env overrides exist.
    return NextResponse.json({ configured: false, settings: effectiveSettings({}) });
  }

  try {
    const db = await loadSettingsFromDb(dsn);
    return NextResponse.json({ configured: true, settings: effectiveSettings(db) });
  } catch (err) {
    console.warn("[settings] read failed:", (err as Error).message);
    return NextResponse.json({
      configured: false,
      error: err instanceof Error ? err.message : "Could not read settings.",
      settings: effectiveSettings({}),
    });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<AppSettings>;
  const dsn = settingsDsn(body.postgres_connection_string);

  if (!dsn) {
    return NextResponse.json(
      {
        configured: false,
        error:
          "No PostgreSQL connection string configured. Set DATABASE_URL (recommended, e.g. in .env / docker-compose) or fill in the connection string below.",
      },
      { status: 400 }
    );
  }

  try {
    const existing = await loadSettingsFromDb(dsn);

    const next: AppSettings = {
      ...existing,
      streamtape_login: pick(body.streamtape_login, existing.streamtape_login),
      cloudinary_cloud_name: pick(
        body.cloudinary_cloud_name,
        existing.cloudinary_cloud_name
      ),
      postgres_connection_string: dsn,
    };
    // Secrets are only replaced when the user typed a new value; blank means
    // "keep the stored one".
    if (body.streamtape_key?.trim()) next.streamtape_key = body.streamtape_key.trim();
    if (body.cloudinary_api_key?.trim())
      next.cloudinary_api_key = body.cloudinary_api_key.trim();
    if (body.cloudinary_api_secret?.trim())
      next.cloudinary_api_secret = body.cloudinary_api_secret.trim();

    await saveSettingsToDb(dsn, next);
    return NextResponse.json({ configured: true, settings: effectiveSettings(next) });
  } catch (err) {
    console.warn("[settings] save failed:", (err as Error).message);
    return NextResponse.json(
      {
        configured: false,
        error: err instanceof Error ? err.message : "Could not save settings.",
      },
      { status: 500 }
    );
  }
}
