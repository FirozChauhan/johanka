import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/auth/config
   Expose the client Firebase config from RUNTIME env, so it works on Render /
   Docker without needing NEXT_PUBLIC_* to be baked in at build time. The web
   API key & project ids are public by design (they ship to the browser anyway),
   so exposing them here is safe. */
export async function GET() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || "";
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || "";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "";
  return NextResponse.json({
    enabled: Boolean(apiKey && authDomain && projectId),
    apiKey,
    authDomain,
    projectId,
  });
}
