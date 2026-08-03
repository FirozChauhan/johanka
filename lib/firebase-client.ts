"use client";

/*
  Browser-side Firebase glue. The firebase JS SDK is imported lazily (only when
  the user clicks "Continue with Google") so the main app bundle stays small.

  Config is loaded at RUNTIME from /api/auth/config (which reads the server's
  env). This works on Render / Docker even when NEXT_PUBLIC_* can't be baked in
  at build time. As a fallback, build-time-inlined values are used if the
  endpoint is unreachable.

  When nothing is configured the Google button is hidden and everyone enters
  as a guest — the app still works.
*/

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
}

/** Build-time inlined values (fallback when the runtime call fails). */
const INLINE: FirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "",
};

function isComplete(c: FirebaseConfig): boolean {
  return Boolean(c.apiKey && c.authDomain && c.projectId);
}

export function inlineFirebaseConfig(): FirebaseConfig | null {
  return isComplete(INLINE) ? INLINE : null;
}

/** Resolve the effective Firebase config, preferring the runtime endpoint. */
export async function loadFirebaseConfig(): Promise<FirebaseConfig | null> {
  try {
    const res = await fetch("/api/auth/config", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as Partial<FirebaseConfig> & { enabled?: boolean };
      const cfg = {
        apiKey: data.apiKey || "",
        authDomain: data.authDomain || "",
        projectId: data.projectId || "",
      };
      if (data.enabled && isComplete(cfg)) return cfg;
    }
  } catch {
    /* fall through to the inlined config */
  }
  return inlineFirebaseConfig();
}

/**
 * Opens the Google sign-in popup and resolves to the Firebase ID token, or
 * null when the user cancels.
 */
export async function signInWithGoogle(config: FirebaseConfig): Promise<string | null> {
  const [{ initializeApp, getApps }, { getAuth, GoogleAuthProvider, signInWithPopup }] =
    await Promise.all([import("firebase/app"), import("firebase/auth")]);

  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
        });

  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  // Ask for the user's profile so we can show their name + avatar.
  provider.addScope("profile");
  provider.addScope("email");

  const cred = await signInWithPopup(auth, provider);
  return await cred.user.getIdToken();
}

