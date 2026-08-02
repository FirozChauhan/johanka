import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { createId } from "@/lib/id";
import { embedUrl } from "@/lib/streamtape";
import type { StreamtapeCreds } from "@/lib/streamtape";
import { uploadViaFtp } from "@/lib/ftp";
import { generateThumbnail, saveThumbnailImage, probeDuration } from "@/lib/ffmpeg";
import { formatBytes, clampUsername, stripExt } from "@/lib/format";
import { boundaryFrom, parseMultipartStream } from "@/lib/multipart";
import type { ParsedUpload } from "@/lib/multipart";

/*
  POST /api/upload — uploads a video to StreamTape via FTP and auto-generates
  a poster frame with ffmpeg.

  STATELESS: credentials come from the browser as form fields. The resulting
  video object is returned to the client, which persists it to localStorage.

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

    const { fields, file: videoFile, thumbnail } = parsed;

    const creds: StreamtapeCreds = {
      streamtape_login: (fields.login || "").trim(),
      streamtape_key: (fields.key || "").trim(),
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

    // 1. Run the FTP upload AND the local thumbnail/duration probing IN
    //    PARALLEL (both read from the same temp file on disk).
    const thumbnailPromise: Promise<string | null> =
      thumbnail && thumbnail.size > 0
        ? (async () => {
            const ext = path.extname(thumbnail.name).toLowerCase() || ".jpg";
            const buffer = fs.readFileSync(thumbnail.tempPath);
            return saveThumbnailImage(buffer, id, ext);
          })()
        : generateThumbnail(videoFile.tempPath, id);

    const [uploaded, thumbnailUrl, duration] = await Promise.all([
      uploadViaFtp(creds, videoFile.tempPath, safeName),
      thumbnailPromise,
      probeDuration(videoFile.tempPath),
    ]);

    // 2. Build the embed URL from the resolved file id.
    const embed = uploaded.fileid ? embedUrl(uploaded.fileid) : null;

    if (!embed) {
      console.warn("[upload] file uploaded via FTP but no file id resolved:", uploaded.remoteName);
    }
    console.log("[upload] done — thumbnail:", thumbnailUrl, "| embed:", embed, "| duration:", duration);

    // 3. Return the video object; the client persists it to localStorage.
    const video = {
      id,
      streamtape_id: uploaded.fileid,
      title,
      description,
      filename: safeName,
      size: formatBytes(videoFile.size),
      duration,
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
