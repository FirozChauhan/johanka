import { NextRequest, NextResponse } from "next/server";
import { deleteFile } from "@/lib/streamtape";
import type { StreamtapeCreds } from "@/lib/streamtape";

/*
  DELETE /api/videos/[id]?login=...&key=...&streamtape_id=...

  Stateless (no DB): the browser already removed the video from its own
  localStorage. This route only best-effort deletes the remote file from
  StreamTape using the credentials + file id the client passes in.
*/
export async function DELETE(
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

  if (!streamtapeId || !creds.streamtape_login || !creds.streamtape_key) {
    // Nothing to delete remotely — treat as success (local metadata already gone).
    return NextResponse.json({ ok: true, note: "no remote file to delete" });
  }

  // Best-effort remote delete; ignore failures so the UI still reflects deletion.
  try {
    await deleteFile(creds, streamtapeId);
  } catch {
    /* ignore remote failures */
  }
  void id;
  return NextResponse.json({ ok: true });
}

