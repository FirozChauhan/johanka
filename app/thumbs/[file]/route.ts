import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

/*
  GET /thumbs/<file>

  Serves a generated poster from disk at request time. The production
  standalone server does NOT serve files dropped into public/ after it
  starts (it relies on a static manifest), so runtime-generated thumbnails
  would 404 if served from public/. This route bypasses that: it reads the
  file from the thumbs dir and returns it with the correct content-type.
*/

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;

  // Only allow a plain `id.ext` filename — prevents path traversal.
  if (!/^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(file)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const thumbsDir = path.join(process.cwd(), "public", "thumbs");
  const filePath = path.join(thumbsDir, file);

  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = path.extname(file).toLowerCase();
  const type =
    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
