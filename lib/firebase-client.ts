"use client";

/*
  Browser-side Firebase glue. The firebase JS SDK is imported lazily (only when
  the user clicks "Continue with Google") so the main app bundle stays small.

  Config comes from NEXT_PUBLIC_FIREBASE_* env vars. When they're absent the
  Google button is hidden and everyone enters as a guest — the app still works.
*/

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
const AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();

export function firebaseEnabled(): boolean {
  return Boolean(API_KEY && AUTH_DOMAIN && PROJECT_ID);
}

/**
 * Opens the Google sign-in popup and resolves to the Firebase ID token, or
 * null when the user cancels / Firebase isn't configured.
 */
export async function signInWithGoogle(): Promise<string | null> {
  if (!firebaseEnabled()) return null;

  const [{ initializeApp, getApps }, { getAuth, GoogleAuthProvider, signInWithPopup }] =
    await Promise.all([import("firebase/app"), import("firebase/auth")]);

  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          apiKey: API_KEY,
          authDomain: AUTH_DOMAIN,
          projectId: PROJECT_ID,
        });

  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  // Ask for the user's profile so we can show their name + avatar.
  provider.addScope("profile");
  provider.addScope("email");

  const cred = await signInWithPopup(auth, provider);
  return await cred.user.getIdToken();
}
