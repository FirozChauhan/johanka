// Isomorphic random id generator (works in Node and the browser).
// No native deps needed — used by the upload route and anywhere else.

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export function createId(len = 10): string {
  const arr = new Uint8Array(len);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[arr[i] % ALPHABET.length];
  return out;
}
