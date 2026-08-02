import * as ftp from "basic-ftp";
import fs from "node:fs";
import { createId } from "./id";
import type { StreamtapeCreds } from "./streamtape";

/*
  StreamTape FTP uploader.

  WHY THIS EXISTS
  ---------------
  StreamTape's HTTP upload endpoint (/file/uploadfile) rejects requests larger
  than ~1 MB with `413 Request Entity Too Large` (Cloudflare in front of the
  API host caps the body size). Real video files are almost always > 1 MB, so
  the HTTP API route is effectively unusable for them.

  StreamTape's *website* uploads over FTP using the SAME "API/FTP username +
  password" credentials the API refers to as `login`/`key`. FTP has no such
  size cap, so this is the route that actually works for video files.

  FLOW
  ----
  1. Connect to ftp.streamtape.com:21 with the user's creds (plain FTP, with
     an opportunistic TLS upgrade).
  2. Upload the file bytes to a unique remote name in the root folder.
  3. Close the FTP session.
  4. Resolve the resulting StreamTape file id. StreamTape doesn't return a file
     id from the FTP transfer itself, so we ask /file/listfolder and match by
     the exact filename we just uploaded. If multiple share a name, we take the
     most recent. If we still can't resolve it, the embed link is built
     defensively so playback still works once StreamTape finishes processing.
*/

const FTP_HOST = "ftp.streamtape.com";
const FTP_PORT = 21;
const FTP_TIMEOUT_MS = 20_000;

export class FtpError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "FtpError";
    this.status = status;
  }
}

export interface FtpUploadResult {
  /** StreamTape file id, if we could resolve it. */
  fileid: string | null;
  /** The remote filename we uploaded as. */
  remoteName: string;
}

/** StreamTape /file/listfolder result shape (the fields we use). */
interface ListFolderResult {
  status: number;
  msg?: string;
  result?: {
    folders?: Array<{ id: string; name: string }>;
    files?: Array<{
      /** StreamTape's file id is exposed as `linkid` in folder listings. */
      linkid?: string;
      /** Full public link, e.g. https://streamtape.com/v/<linkid>/<name> */
      link?: string;
      name?: string;
      size?: number;
      created_at?: number;
      /** Older/different listings may use `created` instead of `created_at`. */
      created?: number;
    }>;
  };
}

/** Normalize a filename for comparison (StreamTape replaces spaces with _). */
function normName(s: string): string {
  return s.replace(/\s+/g, "_");
}

/** Open an FTP session, trying TLS-upgraded FTPS first then plain FTP. */
async function connect(creds: StreamtapeCreds): Promise<ftp.Client> {
  const client = new ftp.Client(FTP_TIMEOUT_MS);
  client.ftp.verbose = false;

  const base = {
    host: FTP_HOST,
    port: FTP_PORT,
    user: creds.streamtape_login!,
    password: creds.streamtape_key!,
  };

  try {
    // Explicit FTPS: upgrade to TLS after the plain-text connect.
    await client.access({ ...base, secure: true });
    return client;
  } catch {
    // Fall back to plain FTP if the server refuses TLS / it's blocked.
    try {
      client.close();
    } catch { /* ignore */ }
  }

  const plain = new ftp.Client(FTP_TIMEOUT_MS);
  plain.ftp.verbose = false;
  try {
    await plain.access({ ...base, secure: false });
    return plain;
  } catch (err) {
    try { plain.close(); } catch { /* ignore */ }
    throw new FtpError(
      `Could not connect to StreamTape FTP at ${FTP_HOST}:${FTP_PORT}. ` +
        `Underlying error: ${(err as Error).message}`,
      502
    );
  }
}

/**
 * Upload a local video file to StreamTape over FTP and resolve the new file id.
 *
 * The file is streamed from disk (fs.createReadStream) so the whole video is
 * never loaded into RAM — this lets large files upload without exhausting
 * memory on low-memory hosts like Render's free tier.
 *
 * @param creds    StreamTape API/FTP username + password
 * @param filePath Absolute path of the video file on disk
 * @param name     The original filename (extension is preserved)
 */
export async function uploadViaFtp(
  creds: StreamtapeCreds,
  filePath: string,
  name: string
): Promise<FtpUploadResult> {
  if (!creds.streamtape_login || !creds.streamtape_key) {
    throw new FtpError(
      "StreamTape credentials are not configured. Add them in Settings.",
      400
    );
  }

  // Preserve the user's extension (StreamTape uses it for playback/processing)
  // but prefix with a unique token so we can reliably find our file afterward
  // even if the account already has a file with the same display name.
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot) : "";
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const remoteName = `${createId(6)}_${base}${ext}`;

  const client = await connect(creds);
  try {
    const stream = fs.createReadStream(filePath);
    // basic-ftp's uploadFrom takes a Readable; it streams from disk over the
    // data connection, keeping memory flat regardless of video size.
    await client.uploadFrom(stream, remoteName);
  } catch (err) {
    try { client.close(); } catch { /* ignore */ }
    throw new FtpError(`FTP upload failed: ${(err as Error).message}`, 502);
  }
  client.close();

  // Resolve the StreamTape file id by listing the root folder and matching
  // the exact remote name we just wrote.
  const fileid = await resolveFileId(creds, remoteName);
  return { fileid, remoteName };
}

/** Ask StreamTape's API for the file id matching `remoteName` (root folder). */
async function resolveFileId(
  creds: StreamtapeCreds,
  remoteName: string
): Promise<string | null> {
  // StreamTape may take a few seconds to index an FTP-uploaded file before it
  // appears in /file/listfolder, so we poll a few times with a short delay.
  //
  // IMPORTANT: the `folder` param must be OMITTED to list the root folder.
  // Sending `folder=` (empty) returns `403 Not your folder`.
  const target = normName(remoteName);
  const url = (page: number) =>
    `https://api.streamtape.com/file/listfolder?login=${encodeURIComponent(
      creds.streamtape_login!
    )}&key=${encodeURIComponent(creds.streamtape_key!)}&per_page=100&page=${page}`;

  // Keep polling SHORT — every 15s+ of polling adds to request latency, and
  // on Render the proxy times out long requests (=> 502). The FTP upload
  // usually lists almost immediately, so a few quick attempts is enough.
  const attempts = 3;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let json: ListFolderResult;
    try {
      const res = await fetch(url(1), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      json = (await res.json()) as ListFolderResult;
    } catch {
      continue;
    }
    if (json.status !== 200 || !json.result?.files) {
      if (attempt === 0) {
        console.warn("[ftp] listfolder response:", JSON.stringify(json));
      }
      continue;
    }

    // Match by normalized name (StreamTape turns spaces into underscores).
    // If several match, take the most recently created.
    const matches = json.result.files.filter(
      (f) => normName(f.name ?? "") === target
    );
    if (matches.length > 0) {
      matches.sort(
        (a, b) => (b.created_at ?? b.created ?? 0) - (a.created_at ?? a.created ?? 0)
      );
      const id = matches[0].linkid;
      if (id) return id;
    }

    if (attempt < attempts - 1) {
      // Short wait before retrying — the file may still be indexing.
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // Couldn't resolve an id — not fatal. The caller builds the embed URL
  // defensively. We still return null rather than failing the whole upload.
  console.warn(
    `[ftp] uploaded ${remoteName} but could not resolve a file id via /file/listfolder. The embed link may need a manual id.`
  );
  return null;
}

/* Optional reachability check; exported for potential diagnostics use. */
export async function pingFtp(creds: StreamtapeCreds): Promise<boolean> {
  if (!creds.streamtape_login || !creds.streamtape_key) return false;
  try {
    const client = await connect(creds);
    client.close();
    return true;
  } catch {
    return false;
  }
}
