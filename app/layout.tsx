import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Johanka — minimal video streaming",
  description:
    "Self-hosted, minimal video streaming powered by StreamTape for free storage.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-10">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10">
          <div className="flex flex-col gap-2 border-t border-line pt-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
            <p>
              <span className="font-medium text-muted">Johanka</span> — a minimal,
              self-hosted streaming service.
            </p>
            <p>Storage by StreamTape · built with Next.js</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
