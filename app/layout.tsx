import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import "./globals.css";
import { TopBar, Sidebar } from "@/components/Nav";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Johanka — minimal video streaming",
  description:
    "Self-hosted, minimal video streaming powered by StreamTape for free storage.",
};

/* A thin footer strip: "Johanka" on the left, "FIROZ" on the right. */
function FooterBar() {
  return (
    <div className="sticky bottom-0 z-40 flex h-9 items-center justify-between border-t border-line bg-base/95 px-4 text-xs backdrop-blur-xl sm:px-6">
      <Link
        href="/"
        className="font-semibold tracking-tight text-fg transition hover:text-accent"
      >
        Johanka
      </Link>
      <span className="font-semibold uppercase tracking-[0.25em] text-muted">
        Firoz
      </span>
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
        <div className="flex min-h-screen flex-col">
          <TopBar />
          <div className="mx-auto flex w-full max-w-[1440px] flex-1">
            <Sidebar />
            <main className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 md:px-8 md:pt-8">
              {children}
            </main>
          </div>
          <FooterBar />
        </div>
      </body>
    </html>
  );
}
