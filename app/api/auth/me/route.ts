import { NextRequest, NextResponse } from "next/server";
import {
  guestCookieName,
  sessionCookieName,
  userFromSessionCookie,
} from "@/lib/auth";
import type { AuthUser } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/auth/me
   Return the current user for this request: an authenticated Google user, a
   guest, or null when anonymous. */
export async function GET(req: NextRequest) {
  const session = req.cookies.get(sessionCookieName())?.value;
  if (session) {
    const user = await userFromSessionCookie(session);
    if (user) return NextResponse.json({ user });
  }

  const guestId = req.cookies.get(guestCookieName())?.value;
  if (guestId) {
    const guest: AuthUser = {
      uid: `guest:${guestId}`,
      email: null,
      displayName: "Guest",
      photoURL: null,
      provider: "guest",
      guest: true,
      guestId,
    };
    return NextResponse.json({ user: guest });
  }

  return NextResponse.json({ user: null });
}
