import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { embedUrl, getThumbnailUrl } from "@/lib/streamtape";
import type { StreamtapeCreds } from "@/lib/streamtape";
import { uploadViaFtp } from "@/lib/ftp";
import { formatBytes, clampUsername, stripExt } from "@/lib/format";
import { boundaryFrom, parseMultipartStream } from "@/lib/multipart";
import type { ParsedUpload } from "@/lib/multipart";
import { loadEffectiveSettings } from "@/lib/server-settings";

/*
  POST /api/upload — uploads a video to StreamTape via FTP.

  Settings (StreamTape creds + optional folder id) are resolved server-side
  from env + the PostgreSQL settings table — the browser never sends
  credentials and the client never holds config. When a folder id is
  configured the file is uploaded into that folder; otherwise it lands in the
  account root. The resulting video object is returned to the client as a
  localStorage fallback catalog.

  THUMBNAILS come straight from StreamTape: they auto-generate a poster once
  the video finishes processing, exposed via /file/getsplash. We resolve that
  URL right here when it's ready; if it isn't yet (still converting) the
  thumbnail is null and the library listing picks it up on a later refresh.
  No ffmpeg, no Cloudinary — StreamTape is the only thumb source.

  MEMORY-SAFE FOR LARGE FILES: the multipart body is streamed straight to a
  temp file on disk (lib/multipart), and the FTP upload reads from that file via
  a stream — so a video never occupies more than a few KB of server RAM no
  matter its size. (Previously the whole body was buffered 2-3x in memory and
  OOM'd on Render's ~512MB free tier for files over ~150MB.)
*/

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const id = createId();
  const tmpDir = path.join(os.tmpdir(), `johanka-${id}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let parsed: ParsedUpload | null = null;

  try {
    const contentType = req.headers.get("content-type") || "";
    const boundary = boundaryFrom(contentType);
    if (!boundary) {
      return NextResponse.json(
        { error: "Invalid multipart upload (missing boundary)." },
        { status: 400 }
      );
    }

    // Stream the request body into the memory-safe multipart parser.
    const body = Readable.fromWeb(req.body as unknown as import("stream/web").ReadableStream);
    parsed = await parseMultipartStream(body, boundary, { tmpDir, id });

    const { fields, file: videoFile } = parsed;

    // Resolve StreamTape + optional PostgreSQL settings server-side (env vars
    // win over values persisted in PostgreSQL). No credentials are read from
    // the browser — the client never holds the config.
    const settings = await loadEffectiveSettings();

    const creds: StreamtapeCreds = {
      streamtape_login: settings.streamtape_login,
      streamtape_key: settings.streamtape_key,
    };

    if (!creds.streamtape_login || !creds.streamtape_key) {
      return NextResponse.json(
        { error: "StreamTape credentials are not configured. Go to /settings and add your API/FTP username + password." },
        { status: 400 }
      );
    }

    if (!videoFile || videoFile.size === 0) {
      return NextResponse.json({ error: "No video file was provided." }, { status: 400 });
    }

    const safeName = videoFile.name.replace(/[\\/"]/g, "_");
    const title = clampUsername((fields.title || "").trim() || stripExt(safeName) || "Untitled");
    const description = (fields.description || "").trim() || null;

    // 1. Stream the file to StreamTape over FTP (reads from the temp file on
    //    disk, so memory stays flat regardless of video size). When a folder
    //    id is configured the file is uploaded into that folder so it shows
    //    up in the library.
    const uploaded = await uploadViaFtp(
      creds,
      videoFile.tempPath,
      safeName,
      settings.streamtapeFolderId
    );

    // 2. Build the embed URL from the resolved file id.
    const embed = uploaded.fileid ? embedUrl(uploaded.fileid) : null;

    if (!embed) {
      console.warn("[upload] file uploaded via FTP but no file id resolved:", uploaded.remoteName);
    }

    // 3. Thumbnail: ask StreamTape for its auto-generated poster. May be null
    //    while the video is still processing — the library listing
    //    (/api/streamtape/files) re-resolves it on later refreshes.
    let thumbnailUrl: string | null = null;
    if (uploaded.fileid) {
      thumbnailUrl = await getThumbnailUrl(creds, uploaded.fileid);
    }

    console.log("[upload] done — thumbnail:", thumbnailUrl, "| embed:", embed);

    // 4. Return the video object; the client keeps a localStorage copy as a
    //    fallback catalog.
    const video = {
      id,
      streamtape_id: uploaded.fileid,
      title,
      description,
      filename: safeName,
      size: formatBytes(videoFile.size),
      duration: null,
      thumbnail: thumbnailUrl,
      status: "ready" as const,
      embed_url: embed,
      direct_url: null,
      created_at: Date.now(),
    };

    return NextResponse.json({ video }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected upload failure.";
    console.error("[upload] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (parsed) {
      try { parsed.cleanup(); } catch { /* best-effort */ }
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}
