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

/* Render-style dashboard shell: a slim top bar + a left sidebar for navigation. */

export function Logo() {
  return (
    <Link href="/" className="flex select-none items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
          <path d="M6 4.5 19 12 6 19.5z" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Johanka</span>
    </Link>
  );
}

const NAV_ITEMS = [
  { href: "/", label: "Library", Icon: HomeIcon },
  { href: "/upload", label: "Upload", Icon: UploadIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function TopBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-base/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4">
        {/* Brand lives in the thin header bar above; this bar is utilities only. */}
        <form onSubmit={submitSearch} className="ml-auto hidden items-center md:flex">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search videos…"
              className="h-9 w-64 rounded-md border border-line bg-sunken pl-9 pr-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </form>

        <Link
          href="/upload"
          className="ml-3 hidden items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong sm:inline-flex"
        >
          <UploadIcon className="h-4 w-4" />
          New video
        </Link>

        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-md p-2 text-muted hover:text-fg md:hidden"
          aria-label="Menu"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile nav */}
      {open && (
        <div className="border-t border-line pb-3 md:hidden">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-1 px-4 pt-3">
            {NAV_ITEMS.map(({ href, label, Icon }) => (
              <MobileLink key={href} href={href} label={label} Icon={Icon} onNavigate={() => setOpen(false)} />
            ))}
            <form onSubmit={submitSearch} className="relative mt-2">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search videos…"
                className="h-9 w-full rounded-md border border-line bg-sunken pl-9 pr-3 text-sm outline-none placeholder:text-faint focus:border-accent/60"
              />
            </form>
          </div>
        </div>
      )}
    </header>
  );
}

function MobileLink({
  href,
  label,
  Icon,
  onNavigate,
}: {
  href: string;
  label: string;
  Icon: typeof HomeIcon;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium " +
        (active ? "bg-surface text-fg" : "text-muted hover:text-fg")
      }
    >
      <Icon className="h-4 w-4" /> {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 border-r border-line md:flex md:flex-col">
      <nav className="sticky top-14 flex-1 space-y-0.5 overflow-y-auto px-3 py-5">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-faint">
          Johanka
        </p>
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={
                "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition " +
                (active
                  ? "bg-surface text-fg"
                  : "text-muted hover:bg-surface/70 hover:text-fg")
              }
            >
              {active && (
                <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded-sm bg-accent" />
              )}
              <Icon className="h-4 w-4" /> {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
