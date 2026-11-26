// Vercel build: map the Supabase integration's variable names onto the ones Prisma expects,
// apply pending migrations, then build Next.js.
import { execSync } from "node:child_process";

const env = { ...process.env };
env.DATABASE_URL ||= env.POSTGRES_PRISMA_URL || env.POSTGRES_URL;
env.DIRECT_URL ||= env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL;

if (!env.DATABASE_URL) {
  console.error("No database configured: set DATABASE_URL/DIRECT_URL or link a Supabase store to this Vercel project.");
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: "inherit", env });
run("npx prisma generate");
run("npx prisma migrate deploy");
run("npx next build");
