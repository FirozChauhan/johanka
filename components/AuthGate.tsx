"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/use-auth";
import { AuthScreen } from "./AuthScreen";

/*
  Gates the app behind authentication. Anonymous visitors see the sign-in
  screen (Google or guest); everyone else sees the real content. A subtle
  spinner covers the brief session-resolution window.
*/
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
      </div>
    );
  }
  if (status === "anon") return <AuthScreen />;
  return <>{children}</>;
}
