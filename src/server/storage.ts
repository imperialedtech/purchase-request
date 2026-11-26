import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Private file storage outside the web root. Files are only ever served through
// authorized route handlers with `Content-Disposition` and `nosniff`, never executed.
// To move to S3 / Supabase Storage, replace these three functions.

function root() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage");
}

function resolveKey(key: string) {
  if (!/^[a-z]+\/[0-9a-f-]{36}$/i.test(key)) throw new Error("Invalid storage key");
  const p = path.resolve(/*turbopackIgnore: true*/ root(), key);
  if (!p.startsWith(root() + path.sep)) throw new Error("Invalid storage path");
  return p;
}

export async function putObject(folder: "attachments" | "logos", data: Buffer) {
  const key = `${folder}/${randomUUID()}`;
  const p = resolveKey(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(p), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ p, data, { mode: 0o600 });
  return key;
}

export async function getObject(key: string) {
  return readFile(/*turbopackIgnore: true*/ resolveKey(key));
}

export async function deleteObject(key: string) {
  await unlink(/*turbopackIgnore: true*/ resolveKey(key)).catch(() => undefined);
}
