import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import "./globals.css";
import { TopBar, Sidebar } from "@/components/Nav";
import { AuthProvider } from "@/lib/use-auth";
import { AuthGate } from "@/components/AuthGate";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const APP_NAME = "Johanka";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: `${APP_NAME} — minimal self-hosted video streaming`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "A minimal, self-hosted video streaming service. Upload videos, auto-generate posters, and stream them back — clean and fast.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ),
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: `${APP_NAME} — minimal self-hosted video streaming`,
    description:
      "Upload videos, auto-generate posters, and stream them back — clean and fast.",
  },
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  colorScheme: "dark",
};

/* A thin footer strip: "Johanka" on the left, "FIROZ" on the right. */
function FooterBar() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || "";
  return (
    <div className="sticky bottom-0 z-40 border-t border-line bg-base/95 backdrop-blur-xl">
      <div className="mx-auto flex h-9 max-w-[1440px] items-center justify-between px-4 text-xs">
        <Link
          href="/"
          className="inline-flex items-baseline gap-1.5 font-semibold tracking-tight text-fg transition hover:text-accent"
        >
          Johanka
          {version && (
            <span className="font-normal text-faint">v{version.replace(/^v/i, "")}</span>
          )}
        </Link>
        <span className="font-semibold uppercase tracking-[0.25em] text-muted">
          Firoz
        </span>
      </div>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans">
        <AuthProvider>
          <div className="flex min-h-screen flex-col">
            <TopBar />
            <div className="mx-auto flex w-full max-w-[1440px] flex-1">
              <Sidebar />
              <main className="app-main min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 md:px-8 md:pt-8">
                <AuthGate>{children}</AuthGate>
              </main>
            </div>
            <FooterBar />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
