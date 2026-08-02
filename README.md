# Johanka

A minimal, clean, self-hosted **video streaming service** built with Next.js.
Upload videos, auto-generate posters, and stream them back — with all the
heavy storage offloaded to **StreamTape's free API** so you don't pay for
bandwidth or disk.

> Clean, dark, minimal UI · drag-and-drop uploads · auto thumbnails via
> ffmpeg · search · continue-watching · zero external database.

---

## Table of contents

1. [How it works](#how-it-works)
2. [Features](#features)
3. [Quick start (local)](#quick-start-local)
4. [Configuring StreamTape](#configuring-streamtape)
5. [Deploying](#deploying)
   - [Docker (recommended)](#docker-recommended)
   - [Bare VPS / Node](#bare-vps--node)
6. [Project structure](#project-structure)
7. [API reference](#api-reference)
8. [Making iterations](#making-iterations)
9. [Troubleshooting](#troubleshooting)

---

## How it works

```
Browser ──upload──▶ Next.js server ──multipart──▶ StreamTape API (free storage)
                         │                              │
                         │  ffmpeg poster frame         │  returns file id + embed URL
                         ▼                              ▼
                      SQLite (metadata) ◀───────────────┘
                         │
              ┌──────────┴───────────┐
              ▼                      ▼
         Home / grid             Watch page
                                 (StreamTape iframe player)
```

- **Storage**: video files live on StreamTape (free tier). We never store the
  video bytes locally — only a poster frame and metadata.
- **Library**: the home page lists files straight from your StreamTape account
  via `file/listfolder` — no local database or localStorage catalog needed.
  Repeat visits hit a short server-side cache; titles and sizes are derived
  from each file's metadata on StreamTape.
- **Playback**: the watch page embeds StreamTape's player via iframe — no
  transcoding infrastructure needed on your side. An optional "Original file"
  button resolves StreamTape's temporary direct mp4 link.

## Features

- 🎬 **Upload** via drag-and-drop or file picker (mp4, webm, mkv, mov, …)
- ☁️ **Live library** — everything in your StreamTape account appears automatically;
  add files anywhere (FTP, the website, another app) and they show up here
- 🖼️ **Auto posters** — ffmpeg extracts a frame; or supply your own image
- 📺 **Streaming** through StreamTape's embeddable player
- 🔎 **Search** videos by title
- ⏯️ **Continue watching** (per-browser history, no accounts)
- ⚙️ **Settings page** to configure StreamTape credentials at runtime
- 🩺 **Health check** that validates credentials against StreamTape's API
- 🎨 **Minimal dark UI** — Inter font, custom design tokens, no UI kit bloat
- 🐳 **Docker-ready** with a standalone Next.js image

---

## Quick start (local)

**Prerequisites**

- Node.js **20+**
- `ffmpeg` + `ffprobe` on your `PATH` (for auto poster generation)
  - macOS: `brew install ffmpeg`
  - Debian/Ubuntu: `sudo apt install ffmpeg`
  - Windows: download from <https://ffmpeg.org>

**Steps**

```bash
# 1. Install dependencies (this also initializes the SQLite DB)
npm install

# 2. Start the dev server
npm run dev
```

Open <http://localhost:3000>. The first time, go to **/settings** and add your
StreamTape credentials (see below), then upload a video from **/upload**.

> No `ffmpeg`? The app still works — uploads succeed, you just won't get an

---

## Deploying

Johanka is designed to be **self-hosted on a persistent filesystem** (a VPS or
Docker volume), because it uses SQLite + local poster files. It is **not**
suited to serverless platforms (Vercel functions, etc.) where the filesystem
is ephemeral.

### Docker (recommended)

```bash
# Option A: credentials via env
STREAMTAPE_LOGIN=xxx STREAMTAPE_KEY=yyy docker compose up --build -d

# Option B: leave blank, then set them in the /settings UI after first run
docker compose up --build -d
```

The app is then available on **http://localhost:3000** (or your server's IP).

- Data persists in the `johanka-data` and `johanka-thumbs` named volumes.
- The image bundles `ffmpeg` so auto-posters work out of the box.
- Healthcheck hits `/` every 30s.

**Behind a reverse proxy (nginx/Caddy):** the app listens on `0.0.0.0:3000`.
For large uploads, make sure your proxy allows big request bodies, e.g. nginx:

```nginx
client_max_body_size 0;   # or e.g. 2048m
proxy_read_timeout 600s;
```

### Bare VPS / Node

```bash
git clone <your-repo> johanka && cd johanka
npm ci
npm run build

# Run with env (or configure via /settings UI afterward)
STREAMTAPE_LOGIN=xxx STREAMTAPE_KEY=yyy \
  npm start            # serves on 0.0.0.0:3000
```

Keep it alive with a process manager, e.g.:

```bash
npm i -g pm2
pm2 start npm --name johanka -- start
pm2 save && pm2 startup
```

Put it behind nginx/Caddy for TLS. Remember `client_max_body_size` (nginx) for
large uploads.

---

## Project structure

```
johanka/
├─ app/
│  ├─ api/
│  │  ├─ upload/route.ts            POST   upload file -> StreamTape + DB
│  │  ├─ videos/route.ts            GET    list videos
│  │  ├─ videos/[id]/route.ts       GET/DELETE  one video
│  │  ├─ videos/[id]/direct/route.ts GET   resolve StreamTape direct mp4
│  │  ├─ settings/route.ts          GET/PUT  runtime credentials
│  │  └─ streamtape/health/route.ts GET    validate credentials
│  ├─ watch/[id]/page.tsx           watch page (player + actions)
│  ├─ upload/page.tsx               drag-drop upload UI
│  ├─ settings/page.tsx             operator panel
│  ├─ (home)/page.tsx               home (hero + grids + continue watching)
│  ├─ (home)/loading.tsx            home skeleton loader (scoped to home)
│  ├─ layout.tsx                    shell + Inter font + nav
│  ├─ not-found.tsx                 404
│  └─ globals.css                   design tokens (@theme) + base styles
├─ components/                      Nav, VideoCard/Grid, Player, icons, …
├─ lib/
│  ├─ db.ts                         SQLite connection + migrations
│  ├─ settings.ts                   settings get/set (env overrides DB)
│  ├─ streamtape.ts                 StreamTape API client
│  ├─ videos.ts                     video data-access layer
│  ├─ ffmpeg.ts                     poster extraction + duration probe
│  ├─ format.ts                     bytes/duration/timeAgo helpers
│  └─ types.ts                      shared TS types
├─ scripts/init-db.mjs              DB + thumbs dir bootstrap (postinstall)
├─ Dockerfile / docker-compose.yml  self-hosted deployment
└─ data/ · public/thumbs/           runtime data (gitignored, volume-mounted)
```

## API reference

| Method | Route                      | Purpose                                  |
|--------|----------------------------|------------------------------------------|
| POST   | `/api/upload`              | multipart upload → StreamTape → DB       |
| GET    | `/api/videos`              | list videos (newest first)               |
| GET    | `/api/videos/[id]`         | get one video                            |
| DELETE | `/api/videos/[id]`         | delete metadata + StreamTape file        |
| GET    | `/api/videos/[id]/direct`  | resolve a temporary direct mp4 link      |
| GET    | `/api/settings`            | read settings (key is masked)            |
| PUT    | `/api/settings`            | save StreamTape API/FTP credentials      |
| GET    | `/api/streamtape/health`   | validate credentials + account info      |

---

## Making iterations

The codebase is intentionally small and flat so it's easy to extend.

**Re-skin the UI:** all colors live as tokens in `app/globals.css` under
`@theme { ... }`. Change `--color-accent`, `--color-base`, etc. and the whole
app updates.

**Add a field to videos:** add the column in `lib/db.ts` (migration) and
`scripts/init-db.mjs`, add it to the `Video` type in `lib/types.ts`, map it in
`lib/videos.ts` (`toVideo` / `createVideo` / `updateVideo`), then use it in the
UI. SQLite migrations are additive `CREATE TABLE IF NOT EXISTS`; for altering
existing columns, delete `data/app.db` to reset in dev.

**Use a different storage backend:** replace `lib/streamtape.ts` with another
provider (e.g. Backblaze B2, S3) keeping the same exported functions
(`uploadFile`, `embedUrl`, `getDirectLink`, `deleteFile`). Nothing else needs
to change.

**Switch to Postgres:** swap `lib/db.ts` + `lib/videos.ts` + `lib/settings.ts`
for a Postgres driver; the API routes and UI stay the same.

**Common scripts**

```bash
npm run dev        # dev server with hot reload
npm run build      # production build
npm start          # run the production build
npm run db:init    # (re)initialize the SQLite database
npm run lint       # eslint
```

---

## Troubleshooting

- **"StreamTape credentials are not configured"** — go to `/settings` (or set
  the env vars) and add them.
- **Uploads fail with a StreamTape error** — check the `/settings` status pill
  and `/api/streamtape/health`; verify your API/FTP username + password are
  correct and that your StreamTape account isn't over quota.
- **No poster generated** — ensure `ffmpeg` is installed and on `PATH`. In
  Docker it's bundled for you.
- **`better-sqlite3` native build fails** — make sure build tools are present
  (`python3 make g++` on Debian). The Docker image handles this automatically.
- **Videos don't appear after upload** — the home page is `force-dynamic`, so a
  refresh should show them. If using a CDN in front, disable caching for HTML.
- **Direct mp4 link fails** — some StreamTape files are captcha-protected and
  can't be linked programmatically; the embedded player still works.

---

Built with Next.js 15 (App Router), React 19, Tailwind v4, better-sqlite3, and
ffmpeg. Storage & streaming powered by the StreamTape API.


> auto-generated poster (supply one manually, or you'll get a tasteful
> gradient placeholder).

## Configuring StreamTape

1. Create a free account at <https://streamtape.com>.
2. Go to **streamtape.com → Account** and copy your **API/FTP Username** and
   **API/FTP Password** (StreamTape uses one username + password for both FTP
   and its API; the API refers to them as `login` and `key`).
3. Add them **either**:
   - in the app at **`/settings`** (stored in SQLite, editable at runtime), **or**
   - via environment variables (recommended for production):

     ```bash
     # .env (gitignored)
     STREAMTAPE_LOGIN=your_api_ftp_username
     STREAMTAPE_KEY=your_api_ftp_password
     ```

Env vars take precedence over anything saved in the UI, so you can lock
credentials down in production while still having a convenient settings page
in dev.
