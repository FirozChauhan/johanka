# Johanka

A minimal, clean, self-hosted **video streaming service** built with Next.js.
Upload videos, auto-generate posters, and stream them back — with all the
heavy storage offloaded to **StreamTape's free API** so you don't pay for
bandwidth or disk.

> Clean, dark, minimal UI · drag-and-drop uploads · auto thumbnails via
> ffmpeg · search · continue-watching · optional PostgreSQL persistence.

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
               PostgreSQL (settings + metadata) ◀───────┘
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
- **Settings**: the `/settings` config (StreamTape credentials, Cloudinary,
  the Postgres DSN) is saved server-side in a PostgreSQL `settings` table, so
  it persists across browsers and incognito windows — not per-browser
  localStorage. Env vars still take precedence.
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
- ⚙️ **Settings page** to configure StreamTape credentials at runtime —
  saved to PostgreSQL, not localStorage, so they follow you into incognito
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
# 1. Install dependencies
npm install

# 2. (Optional but recommended) point at a local PostgreSQL for persistence
cp .env.example .env        # then fill in DATABASE_URL + credentials
export DATABASE_URL=postgres://user:password@localhost:5432/johanka

# 3. Start the dev server
npm run dev
```

Open <http://localhost:3000>. The first time, go to **/settings** and add your
StreamTape credentials (see below), then upload a video from **/upload**.
Settings are stored in PostgreSQL (the `settings` and `videos` tables are
created automatically on first use), so they stay the same in every browser —
including incognito.

> No `ffmpeg`? The app still works — uploads succeed, you just won't get an

---

## Deploying

Johanka is designed to be **self-hosted on a persistent filesystem** (a VPS or
Docker volume), because it uses local poster files. It is **not** suited to
serverless platforms (Vercel functions, etc.) where the filesystem is
ephemeral. Add a **PostgreSQL** database for persistent settings and metadata
(without one, the app still works but settings fall back to the browser).

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
│  │  ├─ settings/route.ts          GET/POST  read/save server-persisted settings
│  │  ├─ videos/[id]/route.ts       DELETE  delete StreamTape file
│  │  ├─ videos/[id]/direct/route.ts GET   resolve StreamTape direct mp4
│  │  └─ streamtape/                files/ health/ diagnose  (StreamTape API)
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
│  ├─ db.ts                         PostgreSQL pool + videos/settings tables
│  ├─ settings.ts                   settings resolution (env over DB)
│  ├─ server-settings.ts            server-only settings + admin-key checks
│  ├─ admin-auth.ts                 in-memory admin key for the browser session
│  ├─ streamtape.ts                 StreamTape API client
│  ├─ ffmpeg.ts                     poster extraction + duration probe
│  ├─ format.ts                     bytes/duration/timeAgo helpers
│  └─ types.ts                      shared TS types
├─ Dockerfile / docker-compose.yml  self-hosted deployment
└─ public/thumbs/                   runtime data (gitignored, volume-mounted)
```

## API reference

| Method | Route                      | Purpose                                  |
|--------|----------------------------|------------------------------------------|
| POST   | `/api/upload`              | multipart upload → StreamTape → DB       |
| GET    | `/api/settings`            | read server-persisted settings           |
| POST   | `/api/settings`            | save server-persisted settings (DB)      |
| GET    | `/api/streamtape/files`    | list library from StreamTape account     |
| GET    | `/api/streamtape/health`   | validate credentials + account info      |
| GET    | `/api/streamtape/diagnose` | connectivity diagnostics                 |
| DELETE | `/api/videos/[id]`         | delete StreamTape file                   |
| GET    | `/api/videos/[id]/direct`  | resolve a temporary direct mp4 link      |

---

## Making iterations

The codebase is intentionally small and flat so it's easy to extend.

**Re-skin the UI:** all colors live as tokens in `app/globals.css` under
`@theme { ... }`. Change `--color-accent`, `--color-base`, etc. and the whole
app updates.

**Add a field to videos:** add the column in `lib/db.ts` (`ensureVideosTable`),
add it to the `Video` type in `lib/types.ts`, map it in the API route that
builds videos, then use it in the UI. Tables are created automatically with
`CREATE TABLE IF NOT EXISTS`; to alter existing columns, run an `ALTER TABLE`
or recreate the DB.

**Add a setting:** add the column to the `settings` table in `lib/db.ts`
(`ensureSettingsTable`), add it to `AppSettings` in `lib/types.ts`, and surface
it in `app/api/settings/route.ts` (read + save) and `app/settings/page.tsx`.

**Use a different storage backend:** replace `lib/streamtape.ts` with another
provider (e.g. Backblaze B2, S3) keeping the same exported functions
(`uploadFile`, `embedUrl`, `getDirectLink`, `deleteFile`). Nothing else needs
to change.

**Common scripts**

```bash
npm run dev        # dev server with hot reload
npm run build      # production build
npm start          # run the production build
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
- **Settings don't persist** — the app stores settings in PostgreSQL. Make sure
  `DATABASE_URL` is set in env (or saved in `/settings`), and that the
  database is reachable from the app server.
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
   - in the app at **`/settings`** (persisted to PostgreSQL, editable at
     runtime, follows you into incognito), **or**
   - via environment variables (recommended for production):

     ```bash
     # .env (gitignored)
     STREAMTAPE_LOGIN=your_api_ftp_username
     STREAMTAPE_KEY=your_api_ftp_password
     ```

Env vars take precedence over anything saved in the UI, so you can lock
credentials down in production while still having a convenient settings page
in dev.

---

## Admin key (protecting /settings)

The streaming/library pages are public, but the **config is private**. A long,
random **admin key** unlocks viewing and editing `/settings` (and the other
admin-only endpoints). It is never stored or sent by a regular visitor.

```bash
# Generate one (recommended length)
openssl rand -hex 32        # e.g. 5f3a… (64 hex chars)
```

Two ways to set it:

1. **Env var (recommended, locks from first boot)**
   ```bash
   JOHANKA_ADMIN_KEY=5f3a…   # in .env / Render env / docker-compose
   ```
   It always wins, even over a key saved to the database. Perfect for Render —
   set it in the dashboard once.

2. **From the UI on first run** — if no key is configured anywhere, `/settings`
   shows a "Create an admin key" form. The key is stored in PostgreSQL as a
   **SHA-256 hash** (never plaintext), and the page then locks.

### Who sees what

| Endpoint                          | Access |
|-----------------------------------|--------|
| `GET /api/streamtape/files`       | public — the library |
| `POST /api/upload`                | public — uploads |
| `GET/POST /api/settings`          | **admin key required** |
| `GET /api/streamtape/health`      | **admin key required** |
| `GET /api/streamtape/diagnose`    | **admin key required** |
| `DELETE /api/videos/[id]`         | **admin key required** |
| `GET /api/videos/[id]/direct`     | **admin key required** |

Send the key as `Authorization: Bearer <key>` (a `?key=` query param also
works for programmatic use). The `Delete` / `Original file` buttons on the
watch page only appear once the operator has unlocked `/settings` in that tab.

> **Note:** `POST /api/upload` is intentionally public right now (it's part of
> the streaming service, matching "accessible by anyone"). Anybody can upload
> to your StreamTape account and use its quota. If you'd rather keep uploads
> operator-only, say the word and I'll gate it behind the same admin key.

---

## Cloudinary posters & PostgreSQL persistence

Without any extra setup the library already mirrors everything in your
StreamTape account. Two optional integrations make posters and metadata stick:

- **Cloudinary** (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET`) — the ffmpeg poster frame generated at upload time
  is pushed to Cloudinary and referenced by a stable hosted URL, so cards keep
  real thumbnails even after the local `/thumbs` dir is wiped by a redeploy.
- **PostgreSQL** (`DATABASE_URL`) — holds **everything the server needs to
  remember**:
  - the `settings` table — the operator config from `/settings` (StreamTape
    credentials, Cloudinary keys, the DSN itself), so it's the same in every
    browser and **survives incognito**;
  - the `videos` table — enriched metadata (posters, descriptions, durations,
    custom titles) keyed by StreamTape file id. Both tables are created
    automatically on first use and merge with the raw StreamTape listing on
    every page load.

Both can be configured at runtime in **/settings** (persisted server-side) or
via env vars in production — env vars always win. Everything degrades
gracefully: no Cloudinary → thumbnails stay on the local `/thumbs` dir; no
PostgreSQL → the raw StreamTape listing is used and settings fall back to the
current browser.

> **Incognito tip:** for settings to appear in a browser that has never visited
> `/settings`, set `DATABASE_URL` in your environment (`.env` /
> `docker-compose.yml`). The connection string itself can't come from a browser
> that has no localStorage.
