"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  HomeIcon,
  UploadIcon,
  SettingsIcon,
  SearchIcon,
  MenuIcon,
  XIcon,
} from "./icons";
import { useAuth } from "@/lib/use-auth";

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

/* The search box keeps its input bound to the ?q= URL param (the source of
   truth), so it stays in sync with the results page: it reflects the query on
   load / navigation, and clears when the filter is removed. Without this the
   box would show stale or empty values while the page was already filtered. */
function SearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQ = (searchParams.get("q") ?? "").trim();
  const [draft, setDraft] = useState(currentQ);

  // Mirror the URL query into the box whenever it changes — search, clear,
  // forward/back, or a shared link with ?q= already set.
  useEffect(() => {
    setDraft(currentQ);
  }, [currentQ]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = draft.trim();
    router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
  }

  function clear() {
    setDraft("");
    if (currentQ) router.push("/");
  }

  return (
    <form onSubmit={submit} className="relative w-full">
      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Search videos…"
        aria-label="Search videos"
        className="h-9 w-full border border-line bg-sunken pl-9 pr-16 text-sm text-fg outline-none transition placeholder:text-faint hover:border-fg/25 focus:border-accent/40 focus:ring-2 focus:ring-accent/10 focus-visible:outline-none"
      />
      {draft && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center text-faint transition hover:text-fg"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </form>
  );
}

export function TopBar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-base/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 sm:gap-3">
        {/* Johanka text logo */}
        <Link
          href="/"
          className="text-[15px] font-semibold tracking-tight text-fg transition hover:text-accent"
        >
          Johanka
        </Link>

        <div className="ml-auto hidden w-64 md:block">
          <Suspense fallback={null}>
            <SearchInput />
          </Suspense>
        </div>

        <UserMenu />

        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 text-muted transition hover:text-fg md:hidden"
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
            <div className="mt-2">
              <Suspense fallback={null}>
                <SearchInput />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/*
  Signed-in / guest identity chip in the top bar with a small account menu
  (email + sign out). Hidden while the session is still resolving.
*/
function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the menu on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!user) return null;

  const label = user.guest ? "Guest" : user.displayName || user.email || "Account";
  const initial = (label.charAt(0) || "?").toUpperCase();

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-line bg-surface px-1.5 py-1 text-sm text-fg transition hover:border-accent/40"
        aria-label="Account menu"
      >
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.photoURL} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-semibold text-white">
            {initial}
          </span>
        )}
        <span className="hidden max-w-[110px] truncate sm:inline">{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-md border border-line bg-surface p-1 shadow-card">
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-sm font-medium text-fg">{label}</p>
            {user.email && (
              <p className="mt-0.5 truncate text-xs text-faint">{user.email}</p>
            )}
            <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
              {user.guest ? "Guest session" : "Signed in with Google"}
            </p>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm text-muted transition hover:bg-sunken hover:text-fg"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
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
