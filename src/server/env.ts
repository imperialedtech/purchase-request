// Central place for configuration that has fallbacks.
// Explicit IPRAMS variables always win; otherwise the names injected by Vercel's Supabase
// integration (POSTGRES_*, SUPABASE_*) and Vercel system variables are used, so a project with
// a linked Supabase store needs no manual secret entry.

export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
}

export function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.SUPABASE_JWT_SECRET;
}

export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/+$/, "");
}

export function storageDriver(): "local" | "supabase" {
  if (process.env.STORAGE_DRIVER === "supabase" || process.env.STORAGE_DRIVER === "local") return process.env.STORAGE_DRIVER;
  // On Vercel the filesystem is ephemeral: use Supabase Storage when it is available.
  return process.env.VERCEL && supabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local";
}

export function maxUploadMb() {
  if (process.env.MAX_UPLOAD_MB) return Number(process.env.MAX_UPLOAD_MB);
  return process.env.VERCEL ? 4 : 10; // Vercel caps request bodies at ~4.5 MB
}
