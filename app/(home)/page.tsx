"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getStoredVideos } from "@/lib/localstore";
import { fetchRemoteVideos } from "@/lib/remote";
import type { Video } from "@/lib/types";
import { VideoGrid } from "@/components/VideoGrid";
import { ContinueWatching } from "@/components/ContinueWatching";
import { HeroVideo } from "@/components/HeroVideo";
import { PlusIcon, UploadIcon } from "@/components/icons";

function HomeContent() {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  // The library comes straight from the StreamTape account (resolved
  // server-side). We only fall back to the localStorage list when the remote
  // fetch fails or no credentials are configured.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await fetchRemoteVideos();
      if (cancelled) return;
      setVideos(remote.length > 0 ? remote : getStoredVideos());
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = query
    ? videos.filter((v) => v.title.toLowerCase().includes(query))
    : videos;
  const searching = Boolean(query);
  const subtitle = searching
    ? `${filtered.length} result${filtered.length === 1 ? "" : "s"} for \u201c${query}\u201d`
    : `${filtered.length} video${filtered.length === 1 ? "" : "s"} in your library`;

  // The hero showcases the newest video. It's hidden while searching so
  // results always read as search results, not a landing page.
  const featured =
    !searching && videos.length > 0
      ? [...videos].sort((a, b) => b.created_at - a.created_at)[0]
      : null;

  // Show a skeleton while the library is still loading so the empty state
  // never flashes on first paint.
  if (loading) {
    return (
      <div>
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Library</h1>
          <p className="mt-0.5 text-sm text-muted">Loading your library…</p>
        </header>
        <HomeLoading />
      </div>
    );
  }

  return (
    <div>
      {/* Dashboard header */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Library</h1>
          <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
        </div>
        <Link
          href="/upload"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-strong"
        >
          <PlusIcon className="h-4 w-4" /> New video
        </Link>
      </header>

      {/* Featured hero — newest video, hidden during search */}
      {featured && (
        <div className="mb-8">
          <HeroVideo video={featured} />
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState searching={searching} />
      ) : (
        <div>
          <ContinueWatching videos={videos} />
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold tracking-tight">
                {searching ? "Results" : "All videos"}
              </h2>
              <span className="text-xs text-faint">{filtered.length} video{filtered.length === 1 ? "" : "s"}</span>
            </div>
            <VideoGrid videos={filtered} />
          </section>
        </div>
      )}
    </div>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  if (searching) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surface/40 py-24 text-center">
        <p className="text-sm text-muted">No videos match that search.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line bg-surface/40 px-6 py-24 text-center">
      <span className="mb-5 grid h-12 w-12 place-items-center bg-accent/10 text-accent">
        <PlusIcon className="h-6 w-6" />
      </span>
      <h2 className="text-lg font-semibold tracking-tight">Your library is empty</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Upload your first video — files are stored for free on StreamTape and streamed instantly.
      </p>
      <Link
        href="/upload"
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
      >
        <UploadIcon className="h-4 w-4" /> Upload a video
      </Link>
    </div>
  );
}

function HomeLoading() {
  return (
    <div className="space-y-8">
      {/* Hero skeleton */}
      <div className="mb-8">
        <div className="shimmer relative h-[250px] w-full bg-surface sm:h-[320px] lg:h-[360px]" />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="shimmer aspect-video w-full bg-surface" />
            <div className="shimmer h-3 w-3/4 bg-surface" />
            <div className="shimmer h-3 w-1/3 bg-surface" />
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
