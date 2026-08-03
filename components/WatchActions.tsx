"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Video } from "@/lib/types";
import { pushHistory } from "./ContinueWatching";
import { CopyIcon, CheckIcon, LinkIcon, TrashIcon } from "./icons";
import { authHeaders, isAdmin } from "@/lib/admin-auth";
import { removeStoredVideo } from "@/lib/localstore";

/*
  Action bar for the watch page: marks the video in the Continue-watching
  history, lets you copy the link, open the original file, or delete.
*/
export function WatchActions({ video }: { video: Video }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [directLoading, setDirectLoading] = useState(false);
  // Admin-only actions (Delete / Original file) are hidden from the public;
  // they become available once the operator unlocks /settings in this session.
  const admin = isAdmin();
  const url = typeof window !== "undefined" ? window.location.href : `/watch/${video.id}`;

  useEffect(() => {
    pushHistory(video.id);
  }, [video.id]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard may be blocked */
    }
  }

  async function openOriginal() {
    setDirectLoading(true);
    try {
      const res = await fetch(
        `/api/videos/${video.id}/direct?streamtape_id=${encodeURIComponent(video.streamtape_id ?? "")}`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (data.direct_url) {
        window.open(data.direct_url, "_blank", "noopener");
      } else {
        alert(data.error || data.locked ? "Admin key required." : "Could not resolve a direct link.");
      }
    } catch {
      alert("Request failed.");
    } finally {
      setDirectLoading(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this video permanently?")) return;
    setDeleting(true);
    try {
      // Best-effort remote delete; local metadata is removed either way.
      await fetch(
        `/api/videos/${video.id}?streamtape_id=${encodeURIComponent(video.streamtape_id ?? "")}`,
        { method: "DELETE", headers: authHeaders() }
      ).catch(() => {});
      removeStoredVideo(video.id);
      router.push("/");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  const btn =
    "inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-muted transition hover:border-accent/40 hover:text-fg disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btn} onClick={copy} aria-label="Copy link">
        {copied ? (
          <CheckIcon className="h-4 w-4 text-success" />
        ) : (
          <CopyIcon className="h-4 w-4" />
        )}
        {copied ? "Copied" : "Copy link"}
      </button>

      {admin && (
        <>
          <button className={btn} onClick={openOriginal} disabled={directLoading}>
            <LinkIcon className="h-4 w-4" />
            {directLoading ? "Resolving…" : "Original file"}
          </button>

          <button
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-muted transition hover:border-danger/50 hover:text-danger disabled:opacity-50"
            onClick={remove}
            disabled={deleting}
          >
            <TrashIcon className="h-4 w-4" />
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </>
      )}
    </div>
  );
}
