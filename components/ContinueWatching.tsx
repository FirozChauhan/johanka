"use client";

import { useEffect, useState } from "react";
import type { Video } from "@/lib/types";
import { VideoCard } from "./VideoCard";

/*
  A "Continue watching" row driven by a localStorage history list. The watch
  page pushes { id, ts } entries on mount; here we map them back to videos
  and show the most recent few. Disappears gracefully when empty — no
  account system required.
*/
interface HistoryEntry {
  id: string;
  ts: number;
}

const KEY = "johanka:history";

export function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushHistory(id: string) {
  try {
    const list = readHistory().filter((e) => e.id !== id);
    list.unshift({ id, ts: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* localStorage may be unavailable; ignore */
  }
}

export function ContinueWatching({ videos }: { videos: Video[] }) {
  const [items, setItems] = useState<Video[] | null>(null);

  useEffect(() => {
    const ids = readHistory().map((e) => e.id);
    const byId = new Map(videos.map((v) => [v.id, v]));
    // Preserve history order, drop unknown ids.
    const matched = ids
      .map((id) => byId.get(id))
      .filter((v): v is Video => Boolean(v))
      .slice(0, 6);
    setItems(matched);
  }, [videos]);

  if (!items || items.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight">Continue watching</h2>
        <span className="text-xs text-faint">{items.length} recent</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((v) => (
          <VideoCard key={v.id} video={v} />
        ))}
      </div>
    </section>
  );
}
