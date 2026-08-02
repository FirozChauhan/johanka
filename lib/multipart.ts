import fs from "node:fs";
import type { Readable } from "node:stream";

/*
  A dependency-free, memory-safe multipart/form-data stream parser.

  WHY IT EXISTS
  -------------
  Next's `await req.formData()` buffers the ENTIRE request body in memory, and
  `File.arrayBuffer()` makes a second full copy — so a 250 MB video holds
  ~500-750 MB of RAM on the server. On low-memory hosts (Render free ~512MB)
  that OOM-kills the process for anything but tiny files.

  This parser instead consumes the request body as a stream: it buffers only
  the tiny text fields in memory and writes the (potentially huge) `file` /
  `thumbnail` parts straight to disk as the bytes arrive. Peak memory stays
  bounded (~a few KB of lookahead) regardless of video size.
*/

const HEADER_END = Buffer.from("\r\n\r\n");

export interface MultipartFilePart {
  /** Original client filename (basename), e.g. "clip.mp4". */
  name: string;
  /** Absolute path of the temp file the bytes were streamed to. */
  tempPath: string;
  /** Number of bytes received for this part. */
  size: number;
  /** Content-Type of the part, if the client sent one. */
  contentType?: string;
}

export interface ParsedUpload {
  /** All non-file form fields keyed by field name. */
  fields: Record<string, string>;
  /** The video part (field name "file"), if present. */
  file: MultipartFilePart | null;
  /** The poster part (field name "thumbnail"), if present. */
  thumbnail: MultipartFilePart | null;
  /** Deletes all temp files written during parsing. */
  cleanup: () => void;
}

/** Extract the boundary token from a multipart Content-Type header. */
export function boundaryFrom(contentType?: string | null): string | null {
  if (!contentType) return null;
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (!m) return null;
  return (m[1] || m[2] || "").trim() || null;
}

function parsePartHeaders(block: Buffer): {
  name?: string;
  filename?: string;
  contentType?: string;
} {
  const text = block.toString("latin1");
  const name = /\bname="([^"]*)"/.exec(text)?.[1];
  const filename = /\bfilename="([^"]*)"/.exec(text)?.[1];
  const contentType = /content-type:\s*([^\r\n]+)/i.exec(text)?.[1]?.trim();
  return { name, filename, contentType };
}

type Sink =
  | { kind: "field"; fieldName: string; chunks: Buffer[]; size: number }
  | {
      kind: "file";
      fieldName: string;
      filename: string;
      contentType?: string;
      path: string;
      ws: fs.WriteStream;
      size: number;
    };

interface ParseOpts {
  tmpDir: string;
  id: string;
}

export async function parseMultipartStream(
  stream: Readable,
  boundary: string,
  opts: ParseOpts
): Promise<ParsedUpload> {
  const marker = Buffer.from(`--${boundary}`);
  const delim = Buffer.from(`\r\n--${boundary}`);
  // Trailing window kept unflushed while hunting for a delimiter that may be
  // split across chunk boundaries. Never smaller than the marker + CRLF + "--".
  const keep = delim.length + 4;

  const fields: Record<string, string> = {};
  let file: MultipartFilePart | null = null;
  let thumbnail: MultipartFilePart | null = null;
  const tempPaths: string[] = [];
  const cleanup = () => {
    for (const p of tempPaths) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* already gone */
      }
    }
  };

  let pending: Buffer = Buffer.alloc(0);
  let sink: Sink | null = null;
  let mode: "headers" | "body" | "suffix" = "headers";
  let finished = false;
  // Promises that resolve when each file part's WriteStream has flushed to
  // disk. We must await these before the caller reads the temp files.
  const writeDone: Promise<void>[] = [];

  function openSink(block: Buffer) {
    const h = parsePartHeaders(block);
    const fieldName = h.name ?? "";
    if (h.filename !== undefined) {
      const tmp = `${opts.tmpDir}/${opts.id}-${fieldName}`;
      tempPaths.push(tmp);
      sink = {
        kind: "file",
        fieldName,
        filename: h.filename || "file",
        contentType: h.contentType,
        path: tmp,
        ws: fs.createWriteStream(tmp),
        size: 0,
      };
    } else {
      sink = { kind: "field", fieldName, chunks: [], size: 0 };
    }
  }

  function writeToSink(data: Buffer) {
    if (!sink || data.length === 0) return;
    sink.size += data.length;
    if (sink.kind === "file") sink.ws.write(data);
    else sink.chunks.push(data);
  }

  function finalizeSink() {
    if (!sink) return;
    if (sink.kind === "file") {
      const { fieldName, filename, contentType, path: fpath, size, ws } = sink;
      sink = null;
      // Capture the part now (size is the byte count we tracked); the file
      // content on disk may still be flushing, so track the flush promise.
      const part: MultipartFilePart = {
        name: filename,
        tempPath: fpath,
        size,
        contentType,
      };
      if (fieldName === "file") file = part;
      else if (fieldName === "thumbnail") thumbnail = part;
      writeDone.push(
        new Promise<void>((res) => {
          ws.on("finish", () => res());
          ws.on("error", () => res()); // don't hang the parser on a disk error
          ws.end();
        })
      );
    } else {
      fields[sink.fieldName] = Buffer.concat(sink.chunks).toString("utf8");
      sink = null;
    }
  }

  // Consume as much of `pending` as there is structure for; returns when it
  // needs more bytes. Throws on malformed input.
  function step() {
    while (true) {
      if (finished) return;

      if (mode === "suffix") {
        const mi = pending.indexOf(marker);
        if (mi < 0) return; // need more (should not normally happen)
        const rest = pending.subarray(mi + marker.length);
        if (rest.length < 2) return; // need more
        const two = rest.toString("latin1").slice(0, 2);
        if (two === "--") {
          finished = true; // closing boundary — multipart ends
          return;
        }
        if (two === "\r\n") {
          pending = rest.subarray(2);
          mode = "headers";
          continue;
        }
        finished = true; // malformed tail — stop gracefully
        return;
      }

      if (mode === "headers") {
        const idx = pending.indexOf(HEADER_END);
        if (idx < 0) {
          if (pending.length > 256 * 1024) {
            throw new Error("multipart: part headers too large");
          }
          return; // need more
        }
        const block = pending.subarray(0, idx);
        pending = pending.subarray(idx + HEADER_END.length);
        openSink(block);
        mode = "body";
        continue;
      }

      // mode === "body"
      const idx = pending.indexOf(delim);
      if (idx < 0) {
        // No delimiter yet: flush everything except a trailing window that
        // might contain the start of a split delimiter.
        if (pending.length > keep) {
          writeToSink(pending.subarray(0, pending.length - keep));
          pending = pending.subarray(pending.length - keep);
        }
        return; // need more
      }
      writeToSink(pending.subarray(0, idx));
      finalizeSink();
      pending = pending.subarray(idx); // begins with \r\n--boundary
      mode = "suffix";
      continue;
    }
  }

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => {
      try {
        if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk);
        pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
        step();
      } catch (err) {
        stream.destroy();
        reject(err);
      }
    });
    stream.on("end", async () => {
      try {
        // Flush any trailing body bytes that arrived without a closing boundary.
        if (mode === "body" && sink && pending.length) {
          writeToSink(pending);
          pending = Buffer.alloc(0);
        }
        finalizeSink();
        // Wait for every file part to be fully flushed to disk before the
        // caller reads the temp files.
        await Promise.all(writeDone);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
    stream.on("error", reject);
  });

  return { fields, file, thumbnail, cleanup };
}

