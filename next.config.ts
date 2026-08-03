import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/**
 * Resolve the app version for the footer. Prefers the closest git version tag
 * (e.g. "v1.8.2"), falling back to a short commit hash, then "dev".
 * Resolved at build time and baked into NEXT_PUBLIC_APP_VERSION so it works on
 * Render/Docker where the .git folder isn't present at runtime.
 */
function currentVersion(): string {
  try {
    const tag = execSync("git describe --tags --abbrev=0", {
      encoding: "utf8",
    }).trim();
    if (tag) return tag;
  } catch {
    /* no .git in this environment */
  }
  try {
    const sha = execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
    }).trim();
    if (sha) return sha;
  } catch {
    /* ignore */
  }
  return "dev";
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Produce a self-contained server in .next/standalone so the Docker image
  // doesn't need to ship the whole node_modules tree. See Dockerfile.
  output: "standalone",
  // Keep native/server-only deps external so the standalone tracer includes
  // them. basic-ftp opens raw TCP sockets for FTP uploads and must not be
  // bundled into the server chunk.
  serverExternalPackages: ["basic-ftp", "undici"],
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || currentVersion(),
  },
};

export default nextConfig;
