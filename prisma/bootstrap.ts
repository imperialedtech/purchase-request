/**
 * Idempotent reference-data bootstrap — safe for production.
 * Creates: permission catalogue, system roles, the Imperial EdTech (IET) entity with its
 * existing 3-level approval workflow and default categories, and a placeholder PAVE entity
 * (inactive for PR creation until its template/procedures are supplied).
 */
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLE_DEFAULTS } from "../src/server/auth/permissions";

export const IET_DEPARTMENTS = ["Administration", "Finance", "IT", "Operations", "Sales & Marketing", "Academics", "Human Resources"];
export const IET_CATEGORIES: { name: string; level1Label: string }[] = [
  { name: "IT Equipment", level1Label: "System Administrator" },
  { name: "Office Equipment", level1Label: "Purchasing Officer" },
  { name: "Office Supplies", level1Label: "Purchasing Officer" },
  { name: "Software & Subscriptions", level1Label: "System Administrator" },
  { name: "Services", level1Label: "Purchasing Officer" },
  { name: "Marketing", level1Label: "Purchasing Officer" },
  { name: "Travel", level1Label: "Purchasing Officer" },
  { name: "Other", level1Label: "Purchasing Officer" },
];

export async function bootstrap(db: PrismaClient) {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({ where: { key }, update: { description }, create: { key, description } });
  }
  const perms = await db.permission.findMany();
  const roles: Record<string, string> = {};
  for (const [key, def] of Object.entries(ROLE_DEFAULTS)) {
    const existing = await db.role.findUnique({ where: { key } });
    const role = existing ?? (await db.role.create({ data: { key, name: def.name, description: def.description, isSystem: true } }));
    roles[key] = role.id;
    if (!existing) {
      await db.rolePermission.createMany({
        data: perms.filter((p) => (def.permissions as string[]).includes(p.key)).map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
    }
  }

  const iet = await db.entity.upsert({
    where: { code: "IET" },
    update: {},
    create: {
      code: "IET",
      name: "Imperial EdTech",
      prNumberFormat: "{CODE}-PR-{YEAR}-{SEQ}",
      sequencePadding: 4,
      currencyMode: "SINGLE",
      defaultCurrency: "NGN",
      allowedCurrencies: ["NGN", "USD", "EUR", "GBP"],
      isConfigured: true,
    },
  });
  await db.entity.upsert({
    where: { code: "PAVE" },
    update: {},
    create: {
      code: "PAVE",
      name: "PAVE",
      prNumberFormat: "{CODE}-PR-{YEAR}-{SEQ}",
      defaultCurrency: "NGN",
      allowedCurrencies: ["NGN", "USD", "EUR", "GBP"],
      isConfigured: false, // awaiting PAVE's PR template, approval hierarchy and procedures
    },
  });

  for (const name of IET_DEPARTMENTS) {
    await db.department.upsert({ where: { entityId_name: { entityId: iet.id, name } }, update: {}, create: { entityId: iet.id, name } });
  }
  for (const c of IET_CATEGORIES) {
    await db.category.upsert({
      where: { entityId_name: { entityId: iet.id, name: c.name } },
      update: {},
      create: { entityId: iet.id, name: c.name, level1Label: c.level1Label },
    });
  }

  const wf = await db.approvalWorkflow.findFirst({ where: { entityId: iet.id } });
  if (!wf) {
    await db.approvalWorkflow.create({
      data: {
        entityId: iet.id,
        name: "Imperial EdTech Standard Approval",
        resubmitRule: "RETURNING_STAGE",
        stages: {
          create: [
            { stageOrder: 1, name: "Functional Responsible", statusKey: "PENDING_LEVEL1", approverType: "CATEGORY_APPROVER" },
            { stageOrder: 2, name: "Finance Manager", statusKey: "PENDING_FINANCE", approverType: "ROLE", roleId: roles.FINANCE_MANAGER },
            { stageOrder: 3, name: "Chief of Staff", statusKey: "PENDING_FINAL", approverType: "ROLE", roleId: roles.CHIEF_OF_STAFF },
          ],
        },
      },
    });
  }
  return { ietId: iet.id, roles };
}
