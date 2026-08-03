import { NextRequest, NextResponse } from "next/server";
import { getAccountInfo } from "@/lib/streamtape";
import type { StreamtapeCreds } from "@/lib/streamtape";
import { isAdminRequest, loadEffectiveSettings } from "@/lib/server-settings";

/*
  GET /api/streamtape/health

  ADMIN ONLY: resolves credentials server-side (env wins over the DB) and
  validates them against /account/info. Returns whether StreamTape is
  configured.
*/
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ locked: true, error: "Admin key required." }, { status: 401 });
  }

  const settings = await loadEffectiveSettings();
  const creds: StreamtapeCreds = {
    streamtape_login: settings.streamtape_login,
    streamtape_key: settings.streamtape_key,
  };

  if (!creds.streamtape_login || !creds.streamtape_key) {
    return NextResponse.json({
      configured: false,
      account: null,
      error: "Not configured",
    });
  }

  try {
    const account = await getAccountInfo(creds);
    if (!account) {
      return NextResponse.json({
        configured: true,
        account: null,
        error:
          "Reached StreamTape but the credentials were rejected (check your API/FTP username + password).",
      });
    }
    return NextResponse.json({ configured: true, account });
  } catch (err) {
    return NextResponse.json(
      {
        configured: true,
        account: null,
        error: err instanceof Error ? err.message : "Validation failed",
      },
      { status: 200 }
    );
  }
}
