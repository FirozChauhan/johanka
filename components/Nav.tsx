"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  HomeIcon,
  UploadIcon,
  SettingsIcon,
  SearchIcon,
  MenuIcon,
} from "./icons";

/* A clean, Render-style top bar: tight, hairline bottom border, calm accents. */
export function Logo() {
  return (
    <Link href="/" className="flex select-none items-center gap-2.5">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-ink shadow-[0_0_0_1px_rgb(255_255_255/0.08)]">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
          <path d="M6 4.5 19 12 6 19.5z" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Johanka</span>
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const linkCls = (active: boolean) =>
    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition " +
    (active ? "bg-surface text-fg" : "text-muted hover:bg-surface/50 hover:text-fg");

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
  }

  const searchBox = (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search videos…"
        className="h-9 w-56 rounded-lg border border-line bg-sunken pl-9 pr-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
      />
    </div>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-base/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Logo />

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          <Link href="/" className={linkCls(isActive("/"))}>
            <HomeIcon className="h-4 w-4" /> Library
          </Link>
          <Link href="/upload" className={linkCls(isActive("/upload"))}>
            <UploadIcon className="h-4 w-4" /> Upload
          </Link>
          <Link href="/settings" className={linkCls(isActive("/settings"))}>
            <SettingsIcon className="h-4 w-4" /> Settings
          </Link>
        </nav>

        <form onSubmit={submitSearch} className="ml-auto hidden items-center md:flex">
          {searchBox}
        </form>

        <Link
          href="/upload"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong md:ml-3"
        >
          <UploadIcon className="h-4 w-4" />
          New video
        </Link>

        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto -mr-1 rounded-lg p-2 text-muted hover:text-fg md:hidden"
          aria-label="Menu"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </div>

      {open && (
        <div className="border-t border-line md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            <Link href="/" onClick={() => setOpen(false)} className={linkCls(isActive("/"))}>
              <HomeIcon className="h-4 w-4" /> Library
            </Link>
            <Link href="/upload" onClick={() => setOpen(false)} className={linkCls(isActive("/upload"))}>
              <UploadIcon className="h-4 w-4" /> Upload
            </Link>
            <Link href="/settings" onClick={() => setOpen(false)} className={linkCls(isActive("/settings"))}>
              <SettingsIcon className="h-4 w-4" /> Settings
            </Link>
            <form onSubmit={submitSearch} className="relative mt-2">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search videos…"
                className="h-9 w-full rounded-lg border border-line bg-sunken pl-9 pr-3 text-sm outline-none placeholder:text-faint focus:border-accent/60"
              />
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
