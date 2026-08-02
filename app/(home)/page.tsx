"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getStoredSettings, getStoredVideos } from "@/lib/localstore";
import { fetchRemoteVideos } from "@/lib/remote";
import type { Video } from "@/lib/types";
import { VideoGrid } from "@/components/VideoGrid";
import { ContinueWatching } from "@/components/ContinueWatching";
import { Thumb } from "@/components/Thumb";
import { PlayIcon, UploadIcon, PlusIcon } from "@/components/icons";
import { formatDuration, timeAgo } from "@/lib/format";

function HomeContent() {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const [videos, setVideos] = useState<Video[]>([]);

  // When StreamTape credentials are configured, the library comes straight
  // from the StreamTape account (no localStorage catalog needed). We only fall
  // back to the localStorage list when there are no credentials or the remote
  // fetch fails.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const creds = getStoredSettings();
      if (!creds.streamtape_login || !creds.streamtape_key) {
        if (!cancelled) setVideos(getStoredVideos());
        return;
      }
      const remote = await fetchRemoteVideos();
      if (cancelled) return;
      setVideos(remote.length > 0 ? remote : getStoredVideos());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = query
    ? videos.filter((v) => v.title.toLowerCase().includes(query))
    : videos;
  const latest = filtered[0] ?? null;

  return (
    <div>
      {query && (
        <p className="mb-8 text-sm text-muted">
          {filtered.length} result{filtered.length === 1 ? "" : "s"} for{" "}
          <span className="font-medium text-fg">\u201c{query}\u201d</span>
        </p>
      )}

      {latest && <HeroSection video={latest} />}

      {filtered.length === 0 ? (
        <EmptyState searching={Boolean(query)} />
      ) : (
        <div className="mt-12">
          <ContinueWatching videos={videos} />
          <section className={query ? "" : "mt-12"}>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold tracking-tight">
                {query ? "Matching videos" : "Latest additions"}
              </h2>
              <span className="text-xs text-faint">{filtered.length} videos</span>
            </div>
            <VideoGrid videos={filtered} />
          </section>
        </div>
      )}
    </div>
  );
}

function HeroSection({ video }: { video: Video }) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <div className="absolute inset-0">
        <Thumb
          src={video.thumbnail}
          seed={video.id}
          className="h-full w-full opacity-40"
          imgClassName="h-full w-full object-cover opacity-30 blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-base via-base/70 to-base/20" />
      </div>
      <div className="relative flex min-h-[320px] flex-col justify-end p-6 sm:p-10">
        <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent-strong">
          <span className="h-px w-6 bg-accent" /> Now playing
        </p>
        <h1 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-4xl">{video.title}</h1>
        {video.description && (
          <p className="mt-2 line-clamp-2 max-w-xl text-sm text-muted">{video.description}</p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href={`/watch/${video.id}`}
            className="inline-flex items-center gap-2 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-black transition hover:bg-white"
          >
            <PlayIcon className="h-4 w-4" /> Watch now
          </Link>
          <span className="text-xs text-faint">
            {timeAgo(video.created_at)}
            {video.duration ? ` \u00b7 ${formatDuration(video.duration)}` : ""}
          </span>
        </div>
      </div>
    </section>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  if (searching) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface/40 py-20 text-center">
        <p className="text-sm text-muted">No videos match that search.</p>
      </div>
    );
  }
  return (
    <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface/40 px-6 py-20 text-center">
      <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-accent/10 text-accent">
        <PlusIcon className="h-7 w-7" />
      </span>
      <h2 className="text-lg font-semibold tracking-tight">Your library is empty</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Upload your first video — files are stored for free on StreamTape and streamed instantly.
      </p>
      <Link
        href="/upload"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong"
      >
        <UploadIcon className="h-4 w-4" /> Upload a video
      </Link>
    </div>
  );
}

function HomeLoading() {
  return (
    <div className="space-y-8">
      <div className="shimmer h-[320px] w-full rounded-2xl bg-surface" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="shimmer aspect-video w-full rounded-lg bg-surface" />
            <div className="shimmer h-3 w-3/4 rounded bg-surface" />
            <div className="shimmer h-3 w-1/3 rounded bg-surface" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContent />
    </Suspense>
  );
}
