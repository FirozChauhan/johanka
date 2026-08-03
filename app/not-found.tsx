import Link from "next/link";
import { HomeIcon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-32 text-center">
      <p className="text-5xl font-semibold tracking-tight text-faint">404</p>
      <h1 className="mt-4 text-lg font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-muted">
        The page you’re looking for doesn’t exist or may have been moved.
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
