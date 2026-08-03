import { NextRequest, NextResponse } from "next/server";
import {
  guestCookieName,
  GUEST_MAX_AGE_SECONDS,
  sessionCookieName,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/auth/guest  { guestId? }
   Skip authentication entirely: set a guest cookie (no database row). A passed
   guestId keeps the same guest identity across reloads when the cookie lapses. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { guestId?: unknown };
  const guestId =
    typeof body.guestId === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.guestId)
      ? body.guestId
      : undefined;

  const res = NextResponse.json({ guest: true, guestId: guestId ?? null });
  res.cookies.set(guestCookieName(), guestId ?? `guest-${Date.now()}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_MAX_AGE_SECONDS,
  });
  // A guest visit supersedes any previous session.
  res.cookies.set(sessionCookieName(), "", { path: "/", maxAge: 0 });
  return res;
}
