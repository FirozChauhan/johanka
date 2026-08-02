import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns/promises";
import { getAccountInfo } from "@/lib/streamtape";
import type { StreamtapeCreds } from "@/lib/streamtape";

/*
  GET /api/streamtape/diagnose?login=...&key=...

  Stateless (no DB): credentials come from the browser. Runs a set of
  connectivity checks against StreamTape and returns a structured report.
  Use this when "fetch failed" shows up — it tells you whether the problem is
  DNS, a proxy, TLS, or the API rejecting creds.
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOST = "api.streamtape.com";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const creds: StreamtapeCreds = {
    streamtape_login: (searchParams.get("login") ?? "").trim(),
    streamtape_key: (searchParams.get("key") ?? "").trim(),
  };
  const configured = Boolean(creds.streamtape_login && creds.streamtape_key);

  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    null;

  // 1. DNS — can we resolve the host at all?
  let dnsResult: { ok: boolean; addresses?: string[]; error?: string };
  try {
    const records = await dns.lookup(HOST, { all: true });
    dnsResult = {
      ok: true,
      addresses: records.map((r) => `${r.family === 6 ? "IPv6" : "IPv4"} ${r.address}`),
    };
  } catch (err) {
    dnsResult = { ok: false, error: (err as Error).message };
  }

  // 2. API call — does the real request succeed (and are creds valid)?
  let api: { ok: boolean; configured: boolean; error?: string; account?: unknown };
  if (!configured) {
    api = { ok: false, configured: false, error: "Credentials not configured." };
  } else {
    try {
      const account = await getAccountInfo(creds);
      api = { ok: true, configured: true, account };
    } catch (err) {
      api = { ok: false, configured: true, error: (err as Error).message };
    }
  }

  return NextResponse.json({
    host: HOST,
    timestamp: Date.now(),
    proxy_configured: Boolean(proxy),
    proxy_url: proxy ? proxy.replace(/:([^:@]+)@/, ":***@") : null,
    dns: dnsResult,
    api,
    suggestion: suggest(dnsResult, api, Boolean(proxy)),
  });
}

function suggest(
  dns: { ok: boolean; error?: string },
  api: { ok: boolean; error?: string },
  proxy: boolean
): string {
  if (!dns.ok) {
    return "DNS resolution failed for api.streamtape.com. Check your DNS resolver or try a public one (1.1.1.1 / 8.8.8.8). If you're inside a restricted network, you may need an HTTPS proxy (set HTTPS_PROXY).";
  }
  if (!api.ok && api.error && /timeout|reset|refused|ENOTFOUND|ECONN|fetch failed/i.test(api.error)) {
    return proxy
      ? "Reachability failed even with a proxy configured. Confirm the proxy URL is correct and reachable, and that api.streamtape.com is not blocked by a firewall."
      : "api.streamtape.com resolved but the connection failed (timeout/reset). If a firewall blocks port 443, set HTTPS_PROXY. If IPv6 is flaky, force IPv4. StreamTape may also block some server IPs/regions.";
  }
  if (!api.ok) {
    return "Connected to StreamTape but the API call failed. Check your API/FTP username + password in /settings. Underlying error: " + (api.error ?? "unknown");
  }
  return "Everything looks good — StreamTape is reachable and credentials are valid.";
}

