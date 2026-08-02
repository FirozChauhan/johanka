"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { UploadIcon, XIcon, CheckIcon, FileIcon } from "@/components/icons";
import { getStoredSettings, upsertStoredVideo } from "@/lib/localstore";
import type { Video } from "@/lib/types";

type Stage =
  | "idle"
  | "uploading" // streaming to our server
  | "storing" // forwarding to StreamTape + generating poster
  | "error";

/*
  Upload page. Files are forwarded to StreamTape (free storage) by the
  server at POST /api/upload, which also auto-generates a poster frame with
  ffmpeg and stores metadata in SQLite.
*/
export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pct, setPct] = useState(0);

  const pick = useCallback((f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/") && !/\.(mp4|webm|mkv|mov|avi|m4v)$/i.test(f.name)) {
      setError("Please choose a video file (mp4, webm, mkv, mov…).");
      return;
    }
    setError(null);
    setFile(f);
    // Prefill the title from the file name, unless the user already typed one
    setTitle((t) => t || f.name.replace(/\.[^.]+$/, ""));
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    pick(e.dataTransfer.files?.[0]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setStage("uploading");
    setPct(0);

    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("description", description);
    if (thumb) form.append("thumbnail", thumb);
    // Credentials: the server is stateless, so send the stored StreamTape
    // creds along so it can forward the file. Cloudinary + Postgres settings
    // ride along so the poster upload / catalog enrichment happen server-side.
    const settings = getStoredSettings();
    form.append("login", settings.streamtape_login || "");
    form.append("key", settings.streamtape_key || "");
    form.append("cloudinary_cloud_name", settings.cloudinary_cloud_name || "");
    form.append("cloudinary_api_key", settings.cloudinary_api_key || "");
    form.append("cloudinary_api_secret", settings.cloudinary_api_secret || "");
    form.append("postgres", settings.postgres_connection_string || "");

    // Use XMLHttpRequest instead of fetch() so we get REAL upload progress
    // via upload.onprogress. fetch() has no way to track upload bytes.
    // The progress bar tracks the browser→server upload; once that's done,
    // we switch to a "Storing on StreamTape…" indeterminate state while the
    // server FTPs the file (that part can't be tracked from the browser).
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        // Scale to 0–90%: the last 10% is the server-side FTP upload which
        // we can't track, so we leave room and show "Storing…" after.
        setPct(Math.round((e.loaded / e.total) * 90));
      }
    };

    xhr.onload = () => {
      let data: { video?: Video; error?: string } = {};
      try { data = JSON.parse(xhr.responseText || "{}"); } catch { /* ignore */ }
      if (xhr.status >= 400) {
        setStage("error");
        setError(data.error || "Upload failed. Check the server logs.");
        return;
      }
      // Upload to our server is done; now the server is FTP-ing to StreamTape.
      // That already happened server-side by the time we get the response, so
      // we can jump straight to done.
      setPct(100);
      setStage("storing");
      if (data.video) upsertStoredVideo(data.video);
      // Watch route resolves by StreamTape file id, so land there directly.
      const vid = data.video?.streamtape_id || data.video?.id;
      router.push(vid ? `/watch/${vid}` : "/");
      router.refresh();
    };

    xhr.onerror = () => {
      setStage("error");
      setError("Network error while uploading.");
    };

    xhr.send(form);
  }

  const busy = stage === "uploading" || stage === "storing";

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Upload a video</h1>
        <p className="mt-1 text-sm text-muted">
          Your file is stored for free on StreamTape and streamed instantly.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-6">
        {/* File dropzone */}
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          {!file ? (
            <button
              type="button"
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={
                "flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition " +
                (dragOver
                  ? "border-accent bg-accent/5"
                  : "border-line bg-surface/40 hover:border-accent/40")
              }
            >
              <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-accent/10 text-accent">
                <UploadIcon className="h-6 w-6" />
              </span>
              <span className="text-sm font-medium">Drop a video here</span>
              <span className="mt-1 text-xs text-faint">
                or click to browse · mp4, webm, mkv, mov
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
              <span className="grid h-11 w-11 flex-none place-items-center rounded-lg bg-accent/10 text-accent">
                <FileIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-faint">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="rounded-lg p-2 text-faint hover:text-fg"
                aria-label="Remove file"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        {/* Optional thumbnail */}
        {file && (
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">
              Poster (optional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setThumb(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-fg hover:file:bg-raised"
            />
            <p className="mt-1.5 text-xs text-faint">
              Leave empty to auto-generate a frame from the video.
            </p>
          </div>
        )}

        {/* Fields */}
        {file && (
          <>
            <div>
              <label htmlFor="title" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">
                Title
              </label>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My video"
                className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <div>
              <label htmlFor="description" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="A short summary…"
                className="w-full resize-y rounded-lg border border-line bg-sunken px-3 py-2.5 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </>
        )}

        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {busy && (
          <div className="space-y-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted">
              {stage === "uploading"
                ? `Uploading video… ${pct}%`
                : "Storing on StreamTape…"}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={!file || busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {busy ? (
            <span className="flex items-center gap-2">
              <CheckIcon className="h-4 w-4" /> Working…
            </span>
          ) : (
            <>
              <UploadIcon className="h-4 w-4" /> Upload video
            </>
          )}
        </button>
      </form>
    </div>
  );
}

