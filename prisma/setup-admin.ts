/**
 * Production setup: bootstraps reference data and creates the first System Administrator.
 * Usage:  ADMIN_EMAIL=you@company.com ADMIN_NAME="Your Name" npm run setup:admin
 * Prints a one-time activation link (valid 72h) for the administrator to set their password.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { bootstrap } from "./bootstrap";
import { issueUserToken } from "../src/server/services/auth";
import { audit } from "../src/server/services/audit";
import { appUrl } from "../src/server/env";

const db = new PrismaClient();

// Prisma silently loads the local .env (with the local SESSION_SECRET). When targeting the
// Vercel/Supabase database (POSTGRES_PASSWORD given), the key must match the server's, so drop any
// key whose value came from the local .env file rather than from the operator.
function pinSessionKey() {
  if (!process.env.POSTGRES_PASSWORD) return "SESSION_SECRET";
  let local: Record<string, string> = {};
  try {
    local = parse(readFileSync(path.join(process.cwd(), ".env")));
  } catch {
    /* no local .env */
  }
  for (const k of ["SESSION_SECRET", "SUPABASE_JWT_SECRET"]) if (process.env[k] && process.env[k] === local[k]) delete process.env[k];
  return process.env.SESSION_SECRET ? "SESSION_SECRET" : process.env.SUPABASE_JWT_SECRET ? "SUPABASE_JWT_SECRET" : "derived from POSTGRES_PASSWORD";
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  if (!email || !name) throw new Error("Set ADMIN_EMAIL and ADMIN_NAME");
  const { ietId, roles } = await bootstrap(db);
  const pave = await db.entity.findUniqueOrThrow({ where: { code: "PAVE" } });

  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    user = await db.user.create({
      data: {
        email,
        name,
        entities: { create: [{ entityId: ietId }, { entityId: pave.id }] },
        roles: { create: [{ roleId: roles.SYSTEM_ADMIN! }, { roleId: roles.EMPLOYEE! }] },
      },
    });
    await audit(db, { actor: null, action: "USER_CREATED", targetType: "User", targetId: user.id, summary: `Initial administrator ${email} created by setup script` });
  }
  const keySource = pinSessionKey();
  const token = await issueUserToken(db, user.id, user.passwordHash ? "PASSWORD_RESET" : "INVITE", 72);
  const base = appUrl();
  console.log(`\nAdministrator: ${email}\nSession key: ${keySource}\nActivation link (valid 72h, single use):\n${base}/invite/${token}\n`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
