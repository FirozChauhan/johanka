"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getStoredVideo, getStoredVideos } from "@/lib/localstore";
import { fetchSettings } from "@/lib/client-settings";
import { fetchRemoteVideos } from "@/lib/remote";
import type { Video } from "@/lib/types";
import { Player } from "@/components/Player";
import { WatchActions } from "@/components/WatchActions";
import { VideoGrid } from "@/components/VideoGrid";
import { Thumb } from "@/components/Thumb";
import { FileIcon, ClockIcon, HomeIcon } from "@/components/icons";
import { formatDuration, timeAgo } from "@/lib/format";

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const [ready, setReady] = useState(false);
  const [video, setVideo] = useState<Video | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);

  // The library now mirrors the StreamTape account: when credentials are set we
  // resolve the video from the remote file list (id == StreamTape file id).
  // localStorage is only a fallback when we can't reach the account.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const creds = await fetchSettings();
      let list: Video[] = getStoredVideos();
      if (creds.streamtape_login && creds.streamtape_key) {
        const remote = await fetchRemoteVideos();
        if (cancelled) return;
        if (remote.length > 0) list = remote;
      }
      if (cancelled) return;
      setVideos(list);
      setVideo(list.find((v) => v.id === id) ?? getStoredVideo(id));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!ready) {
    return <div className="py-24 text-center text-sm text-faint">Loading…</div>;
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
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong"
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
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
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
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-faint">More to watch</h3>
          {related.length > 0 ? (
            <div className="space-y-4">
              {related.map((v) => (
                <Link key={v.id} href={`/watch/${v.id}`} className="group flex gap-3">
                  <div className="relative aspect-video w-40 flex-none overflow-hidden rounded-md bg-sunken ring-1 ring-line">
                    <Thumb
                      src={v.thumbnail}
                      seed={v.id}
                      className="h-full w-full"
                      imgClassName="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-accent-strong">{v.title}</p>
                    <p className="mt-1 text-xs text-faint">{formatDuration(v.duration)}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-faint">No other videos yet.</p>
          )}
        </aside>
      </div>

      {related.length > 0 && (
        <div className="mt-12 lg:hidden">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-faint">More to watch</h3>
          <VideoGrid videos={related} compact />
        </div>
      )}
    </div>
  );
}
