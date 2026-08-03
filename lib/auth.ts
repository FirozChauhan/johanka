/*
  Server-only Firebase authentication helpers.

  Flow: the browser completes Google sign-in with the Firebase JS SDK and
  sends the resulting ID token to /api/auth/session. We verify it here with
  the Firebase Admin SDK, upsert the user into PostgreSQL, and mint a signed,
  HTTP-only session cookie. Guests skip the account entirely — a guest cookie
  is set with no database row.

  Console setup required (see README):
    - Google sign-in provider enabled in Firebase Auth
    - A service account private key (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)
  Client-side env (NEXT_PUBLIC_FIREBASE_*) drives the Google button visibility.
*/

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { envDsn } from "./server-settings";
import { upsertUser } from "./db";
import type { AuthUser } from "./types";

const COOKIE_NAME = "johanka_session";
const GUEST_COOKIE = "johanka_guest";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 days
export const GUEST_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function sessionCookieName(): string {
  return COOKIE_NAME;
}

export function guestCookieName(): string {
  return GUEST_COOKIE;
}

export function firebaseConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID?.trim() &&
      process.env.FIREBASE_CLIENT_EMAIL?.trim() &&
      process.env.FIREBASE_PRIVATE_KEY?.trim()
  );
}

function adminApp(): App | null {
  if (!firebaseConfigured()) return null;
  const existing = getApps();
  if (existing.length > 0) return existing[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!.trim(),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!.trim(),
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n").trim(),
    }),
  });
}

export function getFirebaseAuth(): Auth | null {
  const app = adminApp();
  return app ? getAuth(app) : null;
}

/** PostgreSQL connection string used to persist users (env DATABASE_URL). */
export function dsn(): string | undefined {
  return envDsn();
}

/**
 * Verify an ID token, persist the user to PostgreSQL (best-effort), and return
 * the user. Throws on an invalid token or when Firebase isn't configured.
 */
export async function persistUserFromIdToken(idToken: string): Promise<AuthUser> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase is not configured on this server.");
  const decoded = await auth.verifyIdToken(idToken);

  const user: AuthUser = {
    uid: decoded.uid,
    email: decoded.email ?? null,
    displayName: decoded.name ?? null,
    photoURL: decoded.picture ?? null,
    provider: "google",
  };

  const target = dsn();
  if (target) {
    try {
      await upsertUser(target, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        provider: "google",
      });
    } catch (err) {
      // User storage is best-effort: a healthy session still works without it.
      console.warn("[auth] could not persist user:", (err as Error).message);
    }
  }

  return user;
}

export async function sessionCookieForIdToken(idToken: string): Promise<string> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase is not configured on this server.");
  return auth.createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
  });
}

/** Resolve an authenticated user from a session cookie, or null when invalid. */
export async function userFromSessionCookie(
  cookie: string | undefined
): Promise<AuthUser | null> {
  if (!cookie) return null;
  const auth = getFirebaseAuth();
  if (!auth) return null;
  try {
    const decoded = await auth.verifySessionCookie(cookie, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
      photoURL: decoded.picture ?? null,
      provider: "google",
    };
  } catch {
    return null;
  }
}
