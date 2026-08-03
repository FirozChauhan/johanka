import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TopBar, Sidebar } from "@/components/Nav";

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
        <div className="flex min-h-screen flex-col">
          <TopBar />
          <div className="mx-auto flex w-full max-w-[1440px] flex-1">
            <Sidebar />
            <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
