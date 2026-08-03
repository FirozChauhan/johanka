import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Resolve the app version for the footer:
 *   1. an explicit NEXT_PUBLIC_APP_VERSION env var (e.g. set in Render),
 *   2. the closest git version tag (e.g. "v1.8.2"),
 *   3. a short commit hash,
 *   4. the package.json "version" (always present — works on Render/Docker,
 *      where the .git folder and tags aren't available at build time).
 */
function pkgVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8")
    ) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "";
  } catch {
    return "";
  }
}

function currentVersion(): string {
  const env = process.env.NEXT_PUBLIC_APP_VERSION?.trim();
  if (env) return env;
  try {
    const tag = execSync("git describe --tags --abbrev=0", {
      encoding: "utf8",
    }).trim();
    if (tag) return tag;
  } catch {
    /* no .git / no tags in this environment */
  }
  try {
    const sha = execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
    }).trim();
    if (sha) return sha;
  } catch {
    /* ignore */
  }
  const pkg = pkgVersion();
  if (pkg) return `v${pkg}`;
  return "dev";
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Produce a self-contained server in .next/standalone so the Docker image
  // doesn't need to ship the whole node_modules tree. See Dockerfile.
  output: "standalone",
  // Keep native/server-only deps external so the standalone tracer includes
  // them. basic-ftp opens raw TCP sockets for FTP uploads and must not be
  // bundled into the server chunk; firebase-admin resolves service-account
  // credentials at runtime and must stay external too.
  serverExternalPackages: ["basic-ftp", "undici", "firebase-admin"],
  env: {
    NEXT_PUBLIC_APP_VERSION: currentVersion(),
  },
};

export default nextConfig;
