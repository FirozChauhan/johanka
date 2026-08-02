import { NextRequest, NextResponse } from "next/server";
import { getAccountInfo } from "@/lib/streamtape";
import type { StreamtapeCreds } from "@/lib/streamtape";

/*
  GET /api/streamtape/health?login=...&key=...

  Stateless: the browser sends the stored credentials as query params (there is
  no server DB anymore). Reports whether StreamTape is configured and, when it
  is, validates the credentials against /account/info.
*/
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const creds: StreamtapeCreds = {
    streamtape_login: (searchParams.get("login") ?? "").trim(),
    streamtape_key: (searchParams.get("key") ?? "").trim(),
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
    // A successful round-trip that yields no account object means the API
    // rejected the credentials — report it rather than showing "Connected".
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

