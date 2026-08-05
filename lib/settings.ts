import type { AppSettings } from "./types";

/*
  Server-side settings resolution.

  The /settings UI stores values in the browser and forwards them along with
  each API request (the app is intentionally stateless). Environment variables
  always win, which is the recommended way to lock credentials down in
  production (see .env.example).
*/

export interface ResolvedSettings {
  streamtape_login?: string;
  streamtape_key?: string;
  streamtapeFolderId?: string;
  postgresConnectionString?: string;
}

function pick(env: string | undefined, fallback?: string): string | undefined {
  const fromEnv = env?.trim();
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  const fromClient = fallback?.trim();
  return fromClient || undefined;
}

export function resolveSettings(client?: Partial<AppSettings>): ResolvedSettings {
  return {
    streamtape_login: pick(process.env.STREAMTAPE_LOGIN, client?.streamtape_login),
    streamtape_key: pick(process.env.STREAMTAPE_KEY, client?.streamtape_key),
    streamtapeFolderId: pick(
      process.env.STREAMTAPE_FOLDER_ID,
      client?.streamtape_folder_id
    ),
    postgresConnectionString: pick(
      process.env.DATABASE_URL || process.env.POSTGRES_URL,
      client?.postgres_connection_string
    ),
  };
}
