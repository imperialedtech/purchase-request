/**
 * Production setup: bootstraps reference data and creates the first System Administrator.
 * Usage:  ADMIN_EMAIL=you@company.com ADMIN_NAME="Your Name" npm run setup:admin
 * Prints a one-time activation link (valid 72h) for the administrator to set their password.
 */
import { PrismaClient } from "@prisma/client";
import { bootstrap } from "./bootstrap";
import { issueUserToken } from "../src/server/services/auth";
import { audit } from "../src/server/services/audit";

const db = new PrismaClient();

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
  const token = await issueUserToken(db, user.id, user.passwordHash ? "PASSWORD_RESET" : "INVITE", 72);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  console.log(`\nAdministrator: ${email}\nActivation link (valid 72h, single use):\n${base}/invite/${token}\n`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
