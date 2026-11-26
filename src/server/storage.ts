import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { storageDriver, supabaseUrl } from "./env";

// Private file storage. Files are only ever served through authorized route handlers with
// `Content-Disposition` and `nosniff`, never executed or exposed publicly.
//
// Drivers (STORAGE_DRIVER):
//   "local"    — a directory outside the web root (STORAGE_DIR). For a single internal server.
//   "database" — PostgreSQL table stored_objects (default on Vercel without a Supabase service key).
//   "supabase" — a PRIVATE Supabase Storage bucket accessed with the service-role key, server-side
//                only (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET). Required on Vercel.

type Folder = "attachments" | "logos";

function driver() {
  return storageDriver();
}

function validKey(key: string) {
  if (!/^[a-z]+\/[0-9a-f-]{36}$/i.test(key)) throw new Error("Invalid storage key");
  return key;
}

// ───────────── local ─────────────

function root() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage");
}

function localPath(key: string) {
  const p = path.resolve(/*turbopackIgnore: true*/ root(), validKey(key));
  if (!p.startsWith(root() + path.sep)) throw new Error("Invalid storage path");
  return p;
}

// ───────────── supabase ─────────────

function sb() {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "iprams-private";
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for STORAGE_DRIVER=supabase");
  return { url, bucket, headers: { Authorization: `Bearer ${key}`, apikey: key } };
}

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const { url, bucket, headers } = sb();
  const r = await fetch(`${url}/storage/v1/bucket/${bucket}`, { headers });
  if (r.ok) {
    const b = (await r.json()) as { public?: boolean };
    if (b.public) throw new Error(`Storage bucket "${bucket}" is public. It must be private.`);
  } else {
    const c = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ id: bucket, name: bucket, public: false }),
    });
    if (!c.ok && c.status !== 409) throw new Error(`Could not create storage bucket: ${c.status} ${await c.text()}`);
  }
  bucketReady = true;
}

// ───────────── database ─────────────

// Loaded lazily so the local/supabase drivers do not depend on the Prisma client.
async function dbClient() {
  return (await import("./db")).db;
}

// ───────────── API ─────────────

export async function putObject(folder: Folder, data: Buffer) {
  const key = `${folder}/${randomUUID()}`;
  if (driver() === "database") {
    await (await dbClient()).storedObject.create({ data: { key, data: new Uint8Array(data), sizeBytes: data.length } });
    return key;
  }
  if (driver() === "supabase") {
    await ensureBucket();
    const { url, bucket, headers } = sb();
    const r = await fetch(`${url}/storage/v1/object/${bucket}/${key}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/octet-stream", "x-upsert": "false" },
      body: new Uint8Array(data),
    });
    if (!r.ok) throw new Error(`Storage upload failed: ${r.status} ${await r.text()}`);
    return key;
  }
  const p = localPath(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(p), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ p, data, { mode: 0o600 });
  return key;
}

export async function getObject(key: string): Promise<Buffer> {
  if (driver() === "database") {
    const o = await (await dbClient()).storedObject.findUnique({ where: { key: validKey(key) } });
    if (!o) throw new Error("Stored object not found");
    return Buffer.from(o.data);
  }
  if (driver() === "supabase") {
    const { url, bucket, headers } = sb();
    const r = await fetch(`${url}/storage/v1/object/authenticated/${bucket}/${validKey(key)}`, { headers });
    if (!r.ok) throw new Error(`Storage download failed: ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  return readFile(/*turbopackIgnore: true*/ localPath(key));
}

export async function deleteObject(key: string) {
  if (driver() === "database") {
    await (await dbClient()).storedObject.deleteMany({ where: { key: validKey(key) } });
    return;
  }
  if (driver() === "supabase") {
    const { url, bucket, headers } = sb();
    await fetch(`${url}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [validKey(key)] }),
    }).catch(() => undefined);
    return;
  }
  await unlink(/*turbopackIgnore: true*/ localPath(key)).catch(() => undefined);
}
