"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  HomeIcon,
  UploadIcon,
  SettingsIcon,
  SearchIcon,
  MenuIcon,
} from "./icons";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 select-none">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-accent-ink">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
          <path d="M6 4.5 19 12 6 19.5z" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">
        Johanka
      </span>
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const link = (href: string, label: string, Icon: typeof HomeIcon, active?: boolean) => {
    const isActive =
      active !== undefined
        ? active
        : href === "/"
          ? pathname === "/"
          : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={
          "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition " +
          (isActive
            ? "bg-surface text-fg"
            : "text-muted hover:text-fg")
        }
      >
        <Icon className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
      </Link>
    );
  };

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-base/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Logo />

        <nav className="ml-3 hidden items-center gap-1 md:flex">
          {link("/", "Home", HomeIcon)}
          {link("/upload", "Upload", UploadIcon)}
          {link("/settings", "Settings", SettingsIcon)}
        </nav>

        {/* Search (desktop) */}
        <form onSubmit={submitSearch} className="ml-auto hidden items-center md:flex">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search videos…"
              className="h-9 w-56 rounded-lg border border-line bg-sunken pl-9 pr-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </form>

        <Link
          href="/upload"
          className="ml-auto hidden items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong md:ml-3 md:flex"
        >
          <UploadIcon className="h-4 w-4" />
          New video
        </Link>

        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-lg p-2 text-muted hover:text-fg md:hidden"
          aria-label="Menu"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile sheet */}
      {open && (
        <div className="border-t border-line-soft md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            {link("/", "Home", HomeIcon)}
            {link("/upload", "Upload", UploadIcon)}
            {link("/settings", "Settings", SettingsIcon)}
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

// Re-export the menu icon for the mobile toggle
