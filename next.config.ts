import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Produce a self-contained server in .next/standalone so the Docker image
  // doesn't need to ship the whole node_modules tree. See Dockerfile.
  output: "standalone",
  // Keep native/server-only deps external so the standalone tracer includes
  // them. basic-ftp opens raw TCP sockets for FTP uploads and must not be
  // bundled into the server chunk.
  serverExternalPackages: ["basic-ftp", "undici"],
};

export default nextConfig;
