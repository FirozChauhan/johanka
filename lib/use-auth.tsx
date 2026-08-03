"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser } from "./types";
import {
  loadFirebaseConfig,
  signInWithGoogle,
  type FirebaseConfig,
} from "./firebase-client";

type AuthStatus = "loading" | "anon" | "authed";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  firebaseEnabled: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const GUEST_FLAG = "johanka:guest-id";

function randomGuestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function establishGuest(id?: string): Promise<boolean> {
  const guestId = id || randomGuestId();
  try {
    const res = await fetch("/api/auth/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestId }),
      cache: "no-store",
    });
    if (!res.ok) return false;
    try {
      localStorage.setItem(GUEST_FLAG, guestId);
    } catch {
      /* storage unavailable — ignore */
    }
    return true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseConfig | null>(null);

  // On mount: resolve the current session and the runtime Firebase config. If
  // anonymous but a guest session was chosen earlier, quietly restore it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Load the effective Firebase config (runtime endpoint, build fallback).
      const cfg = await loadFirebaseConfig();
      if (!cancelled) setFirebaseConfig(cfg);

      let data: { user?: AuthUser | null };
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        data = (await res.json()) as { user?: AuthUser | null };
      } catch {
        if (!cancelled) setStatus("anon");
        return;
      }
      if (cancelled) return;
      if (data.user) {
        setUser(data.user);
        setStatus("authed");
        return;
      }
      // Server says anonymous — restore a prior guest session if one exists.
      let prevGuest = "";
      try {
        prevGuest = localStorage.getItem(GUEST_FLAG) || "";
      } catch {
        /* ignore */
      }
      if (prevGuest) {
        const ok = await establishGuest(prevGuest);
        if (ok) {
          if (cancelled) return;
          setUser({
            uid: `guest:${prevGuest}`,
            email: null,
            displayName: "Guest",
            photoURL: null,
            provider: "guest",
            guest: true,
            guestId: prevGuest,
          });
          setStatus("authed");
          return;
        }
      }
      setStatus("anon");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setSigningIn(true);
    try {
      if (!firebaseConfig) {
        setError("Google sign-in isn’t configured on this instance.");
        return;
      }
      const idToken = await signInWithGoogle(firebaseConfig);
      if (!idToken) {
        // Cancelled the popup — do nothing.
        return;
      }
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        user?: AuthUser;
        error?: string;
      };
      if (!res.ok || !data.user) {
        setError(data.error || "Sign-in failed. Please try again.");
        return;
      }
      try {
        localStorage.removeItem(GUEST_FLAG);
      } catch {
        /* ignore */
      }
      setUser(data.user);
      setStatus("authed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setSigningIn(false);
    }
  }, [firebaseConfig]);

  const continueAsGuest = useCallback(async () => {
    setError(null);
    const guestId = randomGuestId();
    if (await establishGuest(guestId)) {
      setUser({
        uid: `guest:${guestId}`,
        email: null,
        displayName: "Guest",
        photoURL: null,
        provider: "guest",
        guest: true,
        guestId,
      });
      setStatus("authed");
    } else {
      setStatus("anon");
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(GUEST_FLAG);
    } catch {
      /* ignore */
    }
    setUser(null);
    setStatus("anon");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        firebaseEnabled: Boolean(firebaseConfig),
        signingIn,
        error,
        signIn,
        continueAsGuest,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
