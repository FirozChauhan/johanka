"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getStoredVideo, getStoredVideos } from "@/lib/localstore";
import { fetchRemoteVideos } from "@/lib/remote";
import type { Video } from "@/lib/types";
import { Player } from "@/components/Player";
import { WatchActions } from "@/components/WatchActions";
import { VideoGrid } from "@/components/VideoGrid";
import { VideoCard } from "@/components/VideoCard";
import { FileIcon, ClockIcon, HomeIcon } from "@/components/icons";
import { formatDuration, timeAgo } from "@/lib/format";

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const [ready, setReady] = useState(false);
  const [video, setVideo] = useState<Video | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);

  // The library mirrors the StreamTape account. When credentials are configured
  // the video is resolved from the remote file list (id == StreamTape file id).
  // localStorage is only a fallback when we can't reach the account.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let list: Video[] = getStoredVideos();
      const remote = await fetchRemoteVideos();
      if (cancelled) return;
      if (remote.length > 0) list = remote;
      if (cancelled) return;
      setVideos(list);
      const found = list.find((v) => v.id === id) ?? getStoredVideo(id);
      setVideo(found);
      if (found) document.title = `${found.title} · Johanka`;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      // Restore the default title when navigating away.
      document.title = "Johanka";
    };
  }, [id]);

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
        <p className="text-sm text-faint">Loading player…</p>
      </div>
    );
  }
  if (!video) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-32 text-center">
        <p className="text-5xl font-semibold tracking-tight text-faint">404</p>
        <h1 className="mt-4 text-lg font-semibold">This page doesn’t exist</h1>
        <p className="mt-1 text-sm text-muted">
          The video you’re looking for may have been removed.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
        >
          <HomeIcon className="h-4 w-4" /> Back to home
        </Link>
      </div>
    );
  }

  const related = videos.filter((v) => v.id !== video.id).slice(0, 4);
  const meta: Array<[React.ReactNode, string]> = [
    [<ClockIcon key="c" className="h-4 w-4" />, formatDuration(video.duration)],
    [<FileIcon key="f" className="h-4 w-4" />, video.size ?? "—"],
    [<span key="t" className="text-[10px]">↑</span>, timeAgo(video.created_at)],
  ];

  return (
    <div>
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <Player video={video} />
          <h1 className="mt-6 text-xl font-semibold tracking-tight sm:text-2xl">{video.title}</h1>
          {video.description && (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{video.description}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-faint">
            {meta.map(([icon, label], i) => (
              <span key={i} className="inline-flex items-center gap-1.5">{icon}{label}</span>
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-5">
            <WatchActions video={video} />
          </div>
        </div>

        <aside className="hidden lg:block">
          {related.length > 0 ? (
            <div className="space-y-6">
              {related.map((v) => (
                <VideoCard key={v.id} video={v} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-faint">No other videos yet.</p>
          )}
        </aside>
      </div>

      {related.length > 0 && (
        <div className="mt-8 lg:hidden">
          <h3 className="mb-4 text-base font-semibold tracking-tight">More to watch</h3>
          <VideoGrid videos={related} compact />
        </div>
      )}
    </div>
  );
}
