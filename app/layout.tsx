import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter, Aref_Ruqaa_Ink } from "next/font/google";
import "./globals.css";
import { TopBar, Sidebar } from "@/components/Nav";
import { AuthProvider } from "@/lib/use-auth";
import { AuthGate } from "@/components/AuthGate";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const arefRuqaaInk = Aref_Ruqaa_Ink({
  subsets: ["arabic"],
  weight: "700",
  variable: "--font-aref-ruqaa",
});

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

/* A thin footer strip: "Johanka" on the left, the name in Aref Ruqaa Ink on the right. */
function FooterBar() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || "";
  return (
    <footer className="sticky bottom-0 z-40 border-t border-line bg-base/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-2 px-4 py-4 sm:flex-row sm:items-center sm:px-6 md:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight text-fg transition hover:text-accent"
        >
          Johanka
          {version && (
            <span className="font-normal text-faint">v{version.replace(/^v/i, "")}</span>
          )}
        </Link>

        <span
          dir="rtl"
          className="-translate-y-2 bg-gradient-to-r from-fg via-fg to-accent bg-clip-text font-aref-ruqaa text-2xl leading-tight text-transparent sm:text-[28px]"
        >
          فیروز خان چوہان
        </span>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${arefRuqaaInk.variable}`}>
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
