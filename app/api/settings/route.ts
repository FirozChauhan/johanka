import { NextRequest, NextResponse } from "next/server";
import { loadSettingsFromDb, saveSettingsToDb } from "@/lib/db";
import {
  adminKeyConfigured,
  envAdminKey,
  envDsn,
  isAdminRequest,
  overlayEnv,
  storeAdminKey,
} from "@/lib/server-settings";
import type { AppSettings } from "@/lib/types";

/*
  GET  /api/settings?postgres=...bootstrap-dsn...
  POST /api/settings

  The operator config. Settings are stored in the PostgreSQL `settings` table
  (survive across browsers / incognito) and are PROTECTED by an admin key:
    1. JOHANKA_ADMIN_KEY env var, if set (always wins), or
    2. a SHA-256 hash saved to the settings table from the /settings UI.

  The connection string that HOSTS the settings table resolves as env
  DATABASE_URL / POSTGRES_URL first, then the `?postgres=` query param / body
  field (bootstrap for UI-configured installs).

  Lock behavior:
    - No key configured yet  -> 200 { needsSetup: true } and only key creation
      is allowed (POST { admin_key }). Nothing else is exposed.
    - Key configured         -> GET/POST require `Authorization: Bearer <key>`
      (or ?key=). Wrong/missing key returns 401 { locked: true }.

  Env vars (STREAMTAPE_*, DATABASE_URL) always win over values stored in the
  database.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function settingsDsn(req: NextRequest, body?: Partial<AppSettings>): string | undefined {
  const env = envDsn();
  if (env) return env;
  if (body?.postgres_connection_string?.trim()) return body.postgres_connection_string.trim();
  return new URL(req.url).searchParams.get("postgres")?.trim() || undefined;
}

function locked() {
  return NextResponse.json({ locked: true, error: "Admin key required." }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const dsn = settingsDsn(req);

  // Config locked -> require a valid admin key.
  if (await adminKeyConfigured(dsn)) {
    if (!(await isAdminRequest(req, dsn))) return locked();
    if (!dsn) {
      return NextResponse.json({ locked: false, configured: false, settings: overlayEnv({}) });
    }
    try {
      const db = await loadSettingsFromDb(dsn);
      return NextResponse.json({ locked: false, configured: true, settings: overlayEnv(db) });
    } catch (err) {
      console.warn("[settings] read failed:", (err as Error).message);
      return NextResponse.json({
        locked: false,
        configured: false,
        error: err instanceof Error ? err.message : "Could not read settings.",
        settings: overlayEnv({}),
      });
    }
  }

  // No key yet -> offer setup only; never expose settings.
  return NextResponse.json({ locked: false, needsSetup: true, configured: Boolean(dsn), settings: {} });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<AppSettings> & { admin_key?: string };
  const dsn = settingsDsn(req, body);
  const keyConfigured = await adminKeyConfigured(dsn);

  // First-run: no key configured -> the ONLY thing allowed is setting one.
  if (!keyConfigured) {
    const newKey = body.admin_key?.trim();
    if (!newKey) {
      return NextResponse.json(
        { needsSetup: true, error: "No admin key configured. Create one to lock the settings." },
        { status: 400 }
      );
    }
    if (newKey.length < 16) {
      return NextResponse.json(
        { needsSetup: true, error: "Admin key is too short — use at least 16 characters (e.g. openssl rand -hex 32)." },
        { status: 400 }
      );
    }
    if (!dsn) {
      return NextResponse.json(
        { needsSetup: true, error: "No PostgreSQL connection string configured. Set DATABASE_URL in env first." },
        { status: 400 }
      );
    }
    try {
      await storeAdminKey(dsn, newKey);
      console.log("[settings] admin key created (SHA-256 stored).");
      return NextResponse.json({ locked: true });
    } catch (err) {
      console.warn("[settings] store key failed:", (err as Error).message);
      return NextResponse.json({ locked: true, error: err instanceof Error ? err.message : "Could not store the key." }, { status: 500 });
    }
  }

  // Key configured -> require a valid key for every write.
  if (!(await isAdminRequest(req, dsn))) return locked();
  if (!dsn) {
    return NextResponse.json({ locked: false, configured: false, error: "No PostgreSQL connection string configured." }, { status: 400 });
  }

  try {
    const existing = await loadSettingsFromDb(dsn);
    const next: AppSettings = {
      ...existing,
      streamtape_login: pick(body.streamtape_login, existing.streamtape_login),
      // The folder id is optional — an explicitly empty value clears it so the
      // library falls back to the whole account again.
      streamtape_folder_id:
        body.streamtape_folder_id !== undefined
          ? body.streamtape_folder_id.trim() || undefined
          : existing.streamtape_folder_id,
      postgres_connection_string: dsn,
    };
    // Secrets are only replaced when a new value is provided; blank = keep.
    if (body.streamtape_key?.trim()) next.streamtape_key = body.streamtape_key.trim();

    await saveSettingsToDb(dsn, next);

    // Optional: rotate the admin key (only meaningful when not env-managed).
    const rotate = body.admin_key?.trim();
    if (rotate && !envAdminKey()) {
      if (rotate.length < 16) {
        return NextResponse.json({ locked: false, configured: true, error: "New admin key is too short — use at least 16 characters." }, { status: 400 });
      }
      await storeAdminKey(dsn, rotate);
      console.log("[settings] admin key rotated.");
    }

    return NextResponse.json({ locked: false, configured: true, settings: overlayEnv(next) });
  } catch (err) {
    console.warn("[settings] save failed:", (err as Error).message);
    return NextResponse.json(
      { locked: false, configured: false, error: err instanceof Error ? err.message : "Could not save settings." },
      { status: 500 }
    );
  }
}

function pick(env: string | undefined, fallback?: string): string | undefined {
  const fromClient = env?.trim();
  return fromClient || fallback?.trim() || undefined;
}
