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
import { loadEffectiveSettings } from "@/lib/server-settings";
import { cloudinaryConfigured, uploadPoster } from "@/lib/cloudinary";
import { upsertVideo } from "@/lib/db";

/*
  POST /api/upload — uploads a video to StreamTape via FTP and auto-generates
  a poster frame with ffmpeg.

  Settings (StreamTape / Cloudinary / Postgres) are resolved server-side from
  env + the PostgreSQL settings table — the browser never sends credentials and
  the client never holds config. The resulting video object is returned to the
  client as a localStorage fallback catalog.

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

    // Resolve StreamTape + optional Cloudinary/PostgreSQL settings server-side
    // (env vars win over values persisted in PostgreSQL). No credentials are
    // read from the browser — the client never holds the config.
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

    // 3. Optional: push the poster to Cloudinary and keep a stable hosted URL.
    //    The frame stays on disk too, so we degrade to /thumbs/... if
    //    Cloudinary isn't configured or hiccups.
    let posterUrl = thumbnailUrl;
    let posterPublicId: string | null = null;
    if (thumbnailUrl && uploaded.fileid && cloudinaryConfigured(settings)) {
      try {
        const localPath = path.join(process.cwd(), "public", thumbnailUrl);
        if (fs.existsSync(localPath)) {
          const bytes = fs.readFileSync(localPath);
          const up = await uploadPoster(
            {
              cloudName: settings.cloudinaryCloudName,
              apiKey: settings.cloudinaryApiKey,
              apiSecret: settings.cloudinaryApiSecret,
            },
            bytes,
            uploaded.fileid
          );
          posterUrl = up.url;
          posterPublicId = up.publicId;
          console.log("[upload] poster uploaded to Cloudinary:", up.url);
        }
      } catch (err) {
        console.warn(
          "[upload] Cloudinary poster upload failed; keeping the local thumbnail:",
          (err as Error).message
        );
      }
    }

    // 4. Optional: enrich the catalog in Postgres, keyed by StreamTape file id.
    if (settings.postgresConnectionString && uploaded.fileid) {
      try {
        await upsertVideo(settings.postgresConnectionString, {
          streamtape_id: uploaded.fileid,
          title,
          description,
          filename: safeName,
          size_bytes: videoFile.size,
          duration_secs: duration ? Math.round(duration) : null,
          poster_url: posterUrl,
          poster_public_id: posterPublicId,
        });
        console.log("[upload] catalog row upserted for", uploaded.fileid);
      } catch (err) {
        console.warn(
          "[upload] Postgres upsert failed (continuing without enrichment):",
          (err as Error).message
        );
      }
    }

    console.log("[upload] done — poster:", posterUrl, "| embed:", embed, "| duration:", duration);

    // 5. Return the video object; the client keeps a localStorage copy as a
    //    fallback catalog when no backend enrichment is configured.
    const video = {
      id,
      streamtape_id: uploaded.fileid,
      title,
      description,
      filename: safeName,
      size: formatBytes(videoFile.size),
      duration,
      thumbnail: posterUrl,
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
