import { NextRequest, NextResponse } from "next/server";
import { getDirectLink } from "@/lib/streamtape";
import type { StreamtapeCreds } from "@/lib/streamtape";

/*
  GET /api/videos/[id]/direct?login=...&key=...&streamtape_id=...

  Stateless (no DB) — the client passes the stored credentials and the
  StreamTape file id. Resolves StreamTape's temporary direct mp4 link.
  Direct links expire, so this is resolved on demand.
*/
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);

  const creds: StreamtapeCreds = {
    streamtape_login: (searchParams.get("login") ?? "").trim(),
    streamtape_key: (searchParams.get("key") ?? "").trim(),
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

