import { NextRequest, NextResponse } from "next/server";
import { getDirectLink } from "@/lib/streamtape";
import type { StreamtapeCreds } from "@/lib/streamtape";
import { isAdminRequest, loadEffectiveSettings } from "@/lib/server-settings";

/*
  GET /api/videos/[id]/direct?streamtape_id=...

  ADMIN ONLY: resolves StreamTape's temporary direct mp4 link. Credentials are
  resolved server-side (env wins over the DB). Direct links expire, so this is
  resolved on demand.
*/
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ locked: true, error: "Admin key required." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const settings = await loadEffectiveSettings();
  const creds: StreamtapeCreds = {
    streamtape_login: settings.streamtape_login,
    streamtape_key: settings.streamtape_key,
  };
  const streamtapeId = searchParams.get("streamtape_id") ?? "";

  if (!streamtapeId) {
    return NextResponse.json({ error: "No remote file for this video." }, { status: 400 });
  }
  if (!creds.streamtape_login || !creds.streamtape_key) {
    return NextResponse.json({ error: "StreamTape credentials are not configured." }, { status: 400 });
  }

  const direct = await getDirectLink(creds, streamtapeId);
  if (!direct) {
    return NextResponse.json(
      { error: "Could not resolve a direct link for this file." },
      { status: 502 }
    );
  }

  void id;
  return NextResponse.json({ direct_url: direct });
}
