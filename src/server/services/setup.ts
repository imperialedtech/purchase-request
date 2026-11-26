import { createHash, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { bootstrap } from "../../../prisma/bootstrap";
import { hashPassword } from "../auth/crypto";
import { forbidden, invalid } from "../errors";
import { emailSchema, passwordSchema } from "@/lib/validation";
import { audit } from "./audit";

// One-time, in-app creation of the first System Administrator.
// Available only while no administrator with a password exists, and only to someone who knows
// SETUP_CODE — a value the operator chooses and stores in the hosting environment.

export function setupCodeConfigured() {
  return (process.env.SETUP_CODE ?? "").trim().length >= 12;
}

function codeMatches(given: string) {
  const expected = (process.env.SETUP_CODE ?? "").trim();
  const a = createHash("sha256").update(given.trim()).digest();
  const b = createHash("sha256").update(expected).digest();
  return expected.length >= 12 && timingSafeEqual(a, b);
}

export async function setupNeeded(db: PrismaClient) {
  const admins = await db.user.count({
    where: { isActive: true, passwordHash: { not: null }, roles: { some: { role: { key: "SYSTEM_ADMIN" } } } },
  });
  return admins === 0;
}

const setupSchema = z.object({
  code: z.string().min(1, "Enter the setup code"),
  name: z.string().trim().min(2, "Enter your full name").max(120),
  email: emailSchema,
  jobTitle: z.string().trim().max(120).optional().default(""),
  password: passwordSchema,
});

export async function createFirstAdmin(db: PrismaClient, raw: z.input<typeof setupSchema>, ip?: string) {
  if (!setupCodeConfigured()) throw forbidden("Setup is not enabled. Add a SETUP_CODE environment variable (at least 12 characters) and redeploy.");
  const input = setupSchema.parse(raw);
  if (!codeMatches(input.code)) throw invalid("The setup code is incorrect", { code: "Incorrect setup code" });

  return db.$transaction(async (tx) => {
    // Serialize concurrent attempts, then re-check inside the transaction.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(814201)`;
    if (!(await setupNeeded(tx as unknown as PrismaClient))) throw forbidden("Setup has already been completed. Sign in instead.");
    const { ietId, roles } = await bootstrap(tx as unknown as PrismaClient);
    const pave = await tx.entity.findUniqueOrThrow({ where: { code: "PAVE" } });
    const passwordHash = await hashPassword(input.password);

    let user = await tx.user.findUnique({ where: { email: input.email }, include: { roles: { include: { role: true } } } });
    if (user) {
      await tx.user.update({ where: { id: user.id }, data: { name: input.name, jobTitle: input.jobTitle || user.jobTitle, passwordHash, passwordChangedAt: new Date(), isActive: true, failedLoginCount: 0, lockedUntil: null } });
      for (const e of [ietId, pave.id]) await tx.userEntity.upsert({ where: { userId_entityId: { userId: user.id, entityId: e } }, update: {}, create: { userId: user.id, entityId: e } });
      for (const key of ["SYSTEM_ADMIN", "EMPLOYEE"]) if (!user.roles.some((r) => r.role.key === key && r.entityId === null)) await tx.userRole.create({ data: { userId: user.id, roleId: roles[key]!, entityId: null } });
    } else {
      user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          jobTitle: input.jobTitle || null,
          passwordHash,
          passwordChangedAt: new Date(),
          entities: { create: [{ entityId: ietId }, { entityId: pave.id }] },
          roles: { create: [{ roleId: roles.SYSTEM_ADMIN! }, { roleId: roles.EMPLOYEE! }] },
        },
        include: { roles: { include: { role: true } } },
      });
    }
    await audit(tx, { actor: { id: user.id, name: input.name }, action: "FIRST_ADMIN_SETUP", targetType: "User", targetId: user.id, summary: `First administrator ${input.email} set up through the one-time setup page`, ip });
    return user.id;
  });
}
