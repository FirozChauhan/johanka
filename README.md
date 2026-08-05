# Johanka

> Self-hosted video streaming. Free storage, streaming and thumbnails via StreamTape — no ffmpeg, no transcoding, no media on disk.

![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20+-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-optional-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-optional-DD2C00?style=flat-square&logo=firebase&logoColor=white)
![StreamTape](https://img.shields.io/badge/StreamTape-0B4EA2?style=flat-square)

**Flow:** browser → Next.js server → StreamTape (FTP upload, API listing, iframe player). The library is read live from StreamTape on every load; the server keeps no media files.

## Features

- **Live library** — everything in your StreamTape account appears automatically, or just one folder via `STREAMTAPE_FOLDER_ID`
- **Upload** — drag & drop (mp4, webm, mkv, mov, …), streamed to StreamTape over FTP; lands in the configured folder when set
- **Auto thumbnails** — StreamTape generates posters after processing, resolved via `/file/getsplash`
- **Streaming** — StreamTape's embeddable player
- **Search**, continue-watching, optional Google sign-in
- **Locked `/settings`** — operator config protected by an admin key

## Run locally

Requirements: **Node 20+**

```bash
git clone <repo-url> johanka
cd johanka
npm install

# StreamTape credentials — free account at streamtape.com → Account → API/FTP username + password
export STREAMTAPE_LOGIN=your_api_ftp_username
export STREAMTAPE_KEY=your_api_ftp_password
# Optional: show only one folder (id from streamtape.com/f/<folder-id>/…). Blank = whole account.
export STREAMTAPE_FOLDER_ID=

npm run dev
```

Open **http://localhost:3000** — upload at `/upload`.

Production build: `npm run build && npm start`.

## Run with Docker

```bash
STREAMTAPE_LOGIN=xxx STREAMTAPE_KEY=yyy docker compose up --build -d
```

## Configuration

| Env var | Required | Description |
|---|---|---|
| `STREAMTAPE_LOGIN` | ✅ | StreamTape API/FTP username |
| `STREAMTAPE_KEY` | ✅ | StreamTape API/FTP password |
| `STREAMTAPE_FOLDER_ID` | — | Scope library to one folder; uploads go there too. Blank = whole account |
| `JOHANKA_ADMIN_KEY` | — | Locks `/settings`. If unset, `/settings` offers first-run key setup |
| `DATABASE_URL` | — | PostgreSQL: persists `/settings` server-side + stores Google sign-in users |
| `FIREBASE_*` / `NEXT_PUBLIC_FIREBASE_*` | — | Enables Google sign-in. All blank = sign-in disabled |

Same settings can be edited in the **`/settings` UI** instead of env (requires `DATABASE_URL` to persist — otherwise env vars are the source of truth).
