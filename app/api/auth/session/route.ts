import { NextRequest, NextResponse } from "next/server";
import {
  guestCookieName,
  persistUserFromIdToken,
  sessionCookieForIdToken,
  sessionCookieName,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/auth/session  { idToken }
   Verify a Google ID token, store the user in PostgreSQL, and set an HTTP-only
   session cookie. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { idToken?: unknown };
  const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";

  if (!idToken) {
    return NextResponse.json({ error: "Missing idToken." }, { status: 400 });
  }

  let user;
  try {
    user = await persistUserFromIdToken(idToken);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid token." },
      { status: 401 }
    );
  }

  let cookie;
  try {
    cookie = await sessionCookieForIdToken(idToken);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create a session." },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ user });
  res.cookies.set(sessionCookieName(), cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  // A fresh sign-in supersedes any earlier guest visit.
  res.cookies.set(guestCookieName(), "", { path: "/", maxAge: 0 });
  return res;
}
