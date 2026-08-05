import type { AppSettings } from "./types";

/*
  Thin client for the StreamTape API (https://streamtape.com/api).
  StreamTape is used purely as free object storage / CDN for the actual
  video files; Johanka keeps metadata in browser localStorage and embeds
  StreamTape's player (or direct mp4 link) for playback.

  NOTE: The server is fully STATELESS now — credentials are NOT read from any
  DB. Every function that talks to StreamTape takes an explicit
  `StreamtapeCreds` argument, which the route handlers receive from the
  browser (which stores them in localStorage). This is a "get it working
  without a database" design; for anything serious, move creds to env vars.
*/

const API_BASE = "https://api.streamtape.com";

// How long to wait for a StreamTape API response before giving up.
const REQUEST_TIMEOUT_MS = 20_000;

// Some hosts (StreamTape sits behind Cloudflare) reject requests that have no
// User-Agent or a generic "undici"/"node" one. Sending a real UA avoids 403
// blocks and TLS handshakes being dropped.
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0 Safari/537.36 johanka/1.0";

/** StreamTape API/FTP credentials (login = API username, key = API password). */
export type StreamtapeCreds = Pick<AppSettings, "streamtape_login" | "streamtape_key">;

export class StreamTapeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "StreamTapeError";
    this.status = status;
  }
}

interface StResult<T> {
  status: number;
  msg?: string;
  result?: T;
}

export function isConfigured(creds?: StreamtapeCreds): boolean {
  return Boolean(creds?.streamtape_login && creds?.streamtape_key);
}

function auth(query: URLSearchParams, creds: StreamtapeCreds) {
  if (!creds.streamtape_login || !creds.streamtape_key) {
    throw new StreamTapeError(
      "StreamTape credentials are not configured. Add them in Settings.",
      400
    );
  }
  query.set("login", creds.streamtape_login);
  query.set("key", creds.streamtape_key);
  return query;
}

/*
  Translate Node's opaque "fetch failed" into a message that actually tells
  you what went wrong (DNS, TLS, timeout, refused, reset…).
*/
function translateFetchError(err: unknown, url: string): StreamTapeError {
  const causeAny = (err as { cause?: unknown })?.cause;
  const cause = (causeAny ?? err) as { code?: string; message?: string };
  const code = cause?.code ?? "";
  const msg = cause?.message ?? (err as Error)?.message ?? String(err);

  let hint: string;
  if (code === "ENOTFOUND" || /ENOTFOUND|getaddrinfo/i.test(msg)) {
    hint = "DNS lookup failed — this server can't resolve api.streamtape.com. ";
  } else if (code === "ECONNREFUSED") {
    hint = "Connection refused by api.streamtape.com (port blocked/firewalled).";
  } else if (code === "ECONNRESET" || code === "EPIPE") {
    hint = "Connection was reset mid-handshake — StreamTape/Cloudflare likely dropped the request.";
  } else if (/timeout|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|ETIMEDOUT/i.test(code + " " + msg)) {
    hint = "Timed out reaching api.streamtape.com (~" + (REQUEST_TIMEOUT_MS / 1000) + "s). Usually a firewall, a blocked region, or a missing proxy.";
  } else if (/certificate|CERT_|ssl|tls|EPROTO|UNABLE_TO_VERIFY/i.test(msg + " " + code)) {
    hint = "TLS/certificate error talking to api.streamtape.com — check the system clock and CA certificates.";
  } else {
    hint = "Could not reach api.streamtape.com from this server (network/proxy issue).";
  }

  return new StreamTapeError(
    `${hint} [${code || "NO_CODE"}: ${msg}] (url: ${url})`,
    502
  );
}

/*
  Optional HTTP(S) proxy support. undici (Node's built-in fetch) does NOT
  read HTTP_PROXY automatically, so when one is set we create a ProxyAgent
  and pass it as the request dispatcher.
*/
let cachedDispatcher: unknown | null | undefined;

async function getProxyDispatcher(): Promise<unknown | null> {
  if (cachedDispatcher !== undefined) return cachedDispatcher;
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    "";
  if (!proxy) {
    cachedDispatcher = null;
    return null;
  }
  try {
    const undici = await import("undici");
    cachedDispatcher = new undici.ProxyAgent(proxy);
    console.log("[streamtape] using proxy from HTTPS_PROXY for outbound requests");
    return cachedDispatcher;
  } catch {
    console.warn("[streamtape] HTTPS_PROXY is set but the 'undici' module isn't available");
    cachedDispatcher = null;
    return null;
  }
}

/** Shared fetch wrapper: adds UA, timeout, proxy, and clear error messages. */
async function stFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);
  if (!headers.has("Accept")) headers.set("Accept", "application/json, */*;q=0.8");

  const dispatcher = await getProxyDispatcher();
  const opts = {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...(dispatcher ? { dispatcher } : {}),
  } as RequestInit;

  try {
    return await fetch(url, opts);
  } catch (err) {
    throw translateFetchError(err, url);
  }
}

async function request<T>(endpoint: string, creds: StreamtapeCreds, init?: RequestInit): Promise<StResult<T>> {
  const url = new URL(endpoint, API_BASE);
  auth(url.searchParams, creds);

  const res = await stFetch(url.toString(), init);
  if (!res.ok) {
    throw new StreamTapeError(`StreamTape returned HTTP ${res.status} ${res.statusText}`, res.status);
  }
  const json = (await res.json()) as StResult<T>;
  if (json.status !== 200) {
    throw new StreamTapeError(json.msg || `StreamTape API error (status ${json.status})`, json.status);
  }
  return json;
}

export interface UploadResult {
  fileid: string;
  filename: string;
  folderid: string;
}

/** Upload a file (as a Blob / File / Buffer) to StreamTape. */
export async function uploadFile(creds: StreamtapeCreds, file: Blob, name: string): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file, name);

  const json = await request<UploadResult>("/file/uploadfile", creds, { method: "POST", body: form });

  if (!json.result || !json.result.fileid) {
    // StreamTape reached a 200/status 200 but gave us no file id — it rejected
    // the file itself and put the reason in `msg`. Surface that instead of a
    // generic message, and log the raw response so it's debuggable.
    console.error("[streamtape] upload rejected (no file id). Raw response:", JSON.stringify(json));
    const reason = json.msg && json.msg !== "OK" ? json.msg : "no file id returned";
    throw new StreamTapeError(
      `StreamTape rejected the upload: ${reason}. Check the file is a supported format (mp4/webm/mkv/avi/mov…) and within your account's size quota.`,
      500
    );
  }
  return json.result;
}

/* ----------------------------------------------------------------------------
   Library listing (fetch every file in the account)
---------------------------------------------------------------------------- */

export interface StFile {
  /** StreamTape file id (also used in the embed URL). */
  fileid: string;
  name: string;
  /** Raw byte size, or null if unknown. */
  size: number | null;
  /** Unix timestamp in SECONDS, or null if unknown. */
  created: number | null;
}

/*
  List every file in the account's root folder via /file/listfolder.

  IMPORTANT: do NOT send the `folder` param. Omitting it lists the account
  root; sending `folder=` (empty) returns `403 Not your folder`. The app
  uploads everything to the root folder (see lib/ftp.ts), so this covers the
  whole library. Pagination uses `per_page` + `page`.
*/
export async function listFiles(creds: StreamtapeCreds): Promise<StFile[]> {
  const files: StFile[] = [];
  const perPage = 100;

  // Failsafe cap: 20 pages x per_page = 2000 files at most.
  for (let page = 1; page <= 20; page++) {
    const url = new URL("/file/listfolder", API_BASE);
    auth(url.searchParams, creds);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));

    const res = await stFetch(url.toString());
    if (!res.ok) {
      throw new StreamTapeError(
        `StreamTape returned HTTP ${res.status} ${res.statusText}`,
        res.status
      );
    }
    const json = (await res.json()) as {
      status: number;
      msg?: string;
      result?: {
        folders?: Array<{ id: string; name: string }>;
        files?: Array<{
          linkid?: string;
          name?: string;
          size?: number;
          created_at?: number;
          created?: number;
        }>;
      };
    };

    if (json.status !== 200 || !json.result) {
      throw new StreamTapeError(
        json.msg || `Could not list files (status ${json.status})`,
        json.status || 500
      );
    }

    const pageFiles = json.result.files ?? [];
    for (const f of pageFiles) {
      if (!f.linkid) continue;
      files.push({
        fileid: f.linkid,
        name: f.name || "Untitled",
        size: typeof f.size === "number" && Number.isFinite(f.size) ? f.size : null,
        created: f.created_at ?? f.created ?? null,
      });
    }

    // Fewer than a full page means we reached the last page.
    if (pageFiles.length < perPage) break;
  }

  // Newest first, matching the previous localStorage ordering.
  files.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  return files;
}

/** StreamTape's iframe player URL — the simplest free playback route. */
export function embedUrl(fileid: string): string {
  return `https://streamtape.com/e/${fileid}`;
}


export interface DirectLinkResult {
  direct_link?: string;
  expires?: string;
}

/**
 * Resolve a temporary direct mp4 link for `fileid`.
 * StreamTape requires a two-step ticket flow; most files have captcha off,
 * so this usually just works. Direct links expire, so resolve on demand.
 */
export async function getDirectLink(creds: StreamtapeCreds, fileid: string): Promise<string | null> {
  const ticketUrl = new URL("/file/dlticket", API_BASE);
  auth(ticketUrl.searchParams, creds);
  ticketUrl.searchParams.set("file", fileid);
  const ticketRes = await stFetch(ticketUrl.toString());
  const ticketJson = (await ticketRes.json()) as StResult<{ ticket?: string; captcha?: number }>;

  if (ticketJson.status !== 200 || !ticketJson.result?.ticket) return null;
  if (ticketJson.result.captcha === 1) return null; // captcha files can't be linked

  const dlUrl = new URL("/file/dl", API_BASE);
  auth(dlUrl.searchParams, creds);
  dlUrl.searchParams.set("file", fileid);
  dlUrl.searchParams.set("ticket", ticketJson.result.ticket);
  const dlRes = await stFetch(dlUrl.toString());
  const dlJson = (await dlRes.json()) as StResult<DirectLinkResult>;
  return dlJson.result?.direct_link ?? null;
}

/*
  Resolve StreamTape's auto-generated thumbnail URL for `fileid` via the
  /file/getsplash endpoint.

  StreamTape generates a poster after the video finishes processing
  ("converting"), so this may return null for very recent uploads — callers
  should degrade gracefully and re-resolve later (the library listing does
  this for every file on each refresh). The returned value is a plain public
  image URL (e.g. https://thumb.tapecontent.net/thumb/<fileid>/thumb.jpg)
  that can be hotlinked straight into an <img>.
*/
export async function getThumbnailUrl(
  creds: StreamtapeCreds,
  fileid: string
): Promise<string | null> {
  const url = new URL("/file/getsplash", API_BASE);
  auth(url.searchParams, creds);
  url.searchParams.set("file", fileid);

  try {
    const res = await stFetch(url.toString());
    if (!res.ok) return null;
    const json = (await res.json()) as StResult<string>;
    if (json.status !== 200 || typeof json.result !== "string") return null;
    const thumb = json.result.trim();
    return /^https?:\/\//i.test(thumb) ? thumb : null;
  } catch (err) {
    // Not fatal — the UI falls back to a gradient placeholder.
    console.warn("[streamtape] getsplash failed for", fileid, ":", (err as Error).message);
    return null;
  }
}

export interface FileInfo { name?: string; size?: number; created?: number; }

export async function getFileInfo(creds: StreamtapeCreds, fileid: string): Promise<FileInfo | null> {
  const url = new URL("/file/info", API_BASE);
  auth(url.searchParams, creds);
  url.searchParams.set("file", fileid);
  const res = await stFetch(url.toString());
  const json = (await res.json()) as StResult<Record<string, FileInfo>>;
  return json.result?.[fileid] ?? null;
}

export async function deleteFile(creds: StreamtapeCreds, fileid: string): Promise<void> {
  const url = new URL("/file/delete", API_BASE);
  auth(url.searchParams, creds);
  url.searchParams.set("file", fileid);
  try {
    await stFetch(url.toString());
  } catch {
    // Fail silently — local metadata removal should still proceed.
  }
}

export interface AccountInfo {
  status?: string; email?: string; traffic?: number; storage?: number;
  bandwidth_used?: number; storage_used?: number; files?: number; premium?: boolean;
}

/** Fetch StreamTape account info (used to validate configured credentials). */
export async function getAccountInfo(creds: StreamtapeCreds): Promise<AccountInfo | null> {
  const url = new URL("/account/info", API_BASE);
  auth(url.searchParams, creds);
  const res = await stFetch(url.toString());
  const json = (await res.json()) as StResult<AccountInfo>;
  return json.status === 200 ? (json.result ?? null) : null;
}
