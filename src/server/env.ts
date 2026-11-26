import { createHash } from "node:crypto";

// Central place for configuration that has fallbacks.
// Explicit IPRAMS variables always win; otherwise the names injected by Vercel's Supabase
// integration (POSTGRES_*, SUPABASE_*) and Vercel system variables are used, so a project with
// a linked Supabase store needs no manual secret entry.

export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
}

export function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.SUPABASE_JWT_SECRET) return process.env.SUPABASE_JWT_SECRET;
  // Last resort on a linked Supabase store: derive a key from the server-only database password.
  // Setting SESSION_SECRET explicitly is preferred (rotating the DB password signs everyone out).
  if (process.env.POSTGRES_PASSWORD) return createHash("sha256").update(`iprams-session-key:${process.env.POSTGRES_PASSWORD}`).digest("hex");
  return undefined;
}

export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/+$/, "");
}

export type StorageDriver = "local" | "supabase" | "database";

export function storageDriver(): StorageDriver {
  const d = process.env.STORAGE_DRIVER;
  if (d === "supabase" || d === "local" || d === "database") return d;
  // On Vercel the filesystem is ephemeral: use Supabase Storage when a service key is available,
  // otherwise keep files in PostgreSQL.
  if (process.env.VERCEL) return supabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "database";
  return "local";
}

export function maxUploadMb() {
  if (process.env.MAX_UPLOAD_MB) return Number(process.env.MAX_UPLOAD_MB);
  return process.env.VERCEL ? 4 : 10; // Vercel caps request bodies at ~4.5 MB
}
