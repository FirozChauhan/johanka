# ---- Build stage -----------------------------------------------------------
# Johanka ships as a self-hosted app, so we produce a standalone Next.js image.
# The runtime needs ffmpeg/ffprobe (for auto thumbnails) and a persistent
# volume for SQLite + generated posters.

# Use a slim Debian image because we need apt for ffmpeg. The bookworm-slim
# base keeps the image small while still giving us apt.
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build tools for better-sqlite3 native compilation.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Embed the app version into the bundle. .git is excluded from the image (see
# .dockerignore) so git-based version resolution can't run inside the build;
# instead the version is injected from the host via the APP_VERSION build arg
# (e.g. `APP_VERSION="$(git describe --tags --always)" docker compose build`).
# When the arg is empty the build still succeeds and falls back to package.json.
ARG APP_VERSION=
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}
RUN npm run build

# ---- Runtime stage ---------------------------------------------------------
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Runtime deps: ffmpeg for poster extraction, wget for healthchecks.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg wget \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Better-sqlite3 needs this in some minimal environments.
ENV NODE_OPTIONS=--max-old-space-size=4096

# Copy the standalone Next.js output (no need to copy node_modules wholesale).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Persistent data lives here (SQLite db + generated thumbnails).
RUN mkdir -p /app/data /app/public/thumbs
VOLUME ["/app/data", "/app/public/thumbs"]

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
