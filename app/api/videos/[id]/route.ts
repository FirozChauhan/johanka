import { NextRequest, NextResponse } from "next/server";
import { deleteFile } from "@/lib/streamtape";
import type { StreamtapeCreds } from "@/lib/streamtape";
import { isAdminRequest, loadEffectiveSettings } from "@/lib/server-settings";

/*
  DELETE /api/videos/[id]?streamtape_id=...

  ADMIN ONLY: deletes the remote file from StreamTape. Credentials are resolved
  server-side (env wins over the DB), so a random visitor can't delete the
  library.
*/
export async function DELETE(
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

  if (!streamtapeId || !creds.streamtape_login || !creds.streamtape_key) {
    // Nothing to delete remotely — treat as success.
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
