// After `next build` with output:"standalone", copies the static assets and
// public/ folder into .next/standalone so `node .next/standalone/server.js`
// is fully self-contained. Cross-platform (no shell `cp` needed).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const standalone = path.join(root, "..", ".next", "standalone");

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue; // standalone has its own
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(standalone)) {
  console.log("standalone-copy: .next/standalone not found, skipping.");
  process.exit(0);
}

copyRecursive(path.join(root, "..", ".next", "static"), path.join(standalone, ".next", "static"));
copyRecursive(path.join(root, "..", "public"), path.join(standalone, "public"));

console.log("standalone-copy: copied static + public into .next/standalone ✔");
