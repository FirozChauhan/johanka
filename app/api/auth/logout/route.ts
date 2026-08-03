import { NextResponse } from "next/server";
import { guestCookieName, sessionCookieName } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/auth/logout
   Clear both the session and the guest cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieName(), "", { path: "/", maxAge: 0 });
  res.cookies.set(guestCookieName(), "", { path: "/", maxAge: 0 });
  return res;
}
