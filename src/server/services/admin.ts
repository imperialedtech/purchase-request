import { z } from "zod";
import type { Tx, DB } from "../db";
import { type Actor, assertCan, can, entitiesWith, isAdmin } from "../auth/actor";
import { forbidden, invalid, notFound } from "../errors";
import { emailSchema } from "@/lib/validation";
import { audit } from "./audit";
import { issueUserToken } from "./auth";
import { PERMISSIONS } from "../auth/permissions";

const uuid = z.string().uuid();
const optUuid = z.string().uuid().nullable().optional().or(z.literal("").transform(() => null));

function assertAnyEntity(actor: Actor, perm: Parameters<typeof can>[1]) {
  if (entitiesWith(actor, perm).length === 0) throw forbidden();
}

// ───────────────────────────── Users ─────────────────────────────

export const userInputSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  departmentId: optUuid,
  entityIds: z.array(uuid).min(1, "Assign at least one entity"),
  roles: z.array(z.object({ roleId: uuid, entityId: uuid.nullable() })).min(1, "Assign at least one role"),
  canEditProfile: z.boolean().default(false),
});
export type UserInput = z.input<typeof userInputSchema>;

async function checkRoleAssignment(tx: Tx, actor: Actor, input: z.output<typeof userInputSchema>) {
  const allowedEntities = entitiesWith(actor, "admin.users");
  for (const e of input.entityIds) if (!allowedEntities.includes(e)) throw forbidden("You cannot assign users to that entity");
  const roles = await tx.role.findMany({ where: { id: { in: input.roles.map((r) => r.roleId) } } });
  if (roles.length !== new Set(input.roles.map((r) => r.roleId)).size) throw invalid("Unknown role");
  if (roles.some((r) => r.key === "SYSTEM_ADMIN") && !isAdmin(actor)) throw forbidden("Only a System Administrator can grant administrator access");
  for (const r of input.roles) if (r.entityId && !input.entityIds.includes(r.entityId)) throw invalid("A role is scoped to an entity the user is not a member of");
  if (input.departmentId) {
    const d = await tx.department.findUnique({ where: { id: input.departmentId } });
    if (!d || !input.entityIds.includes(d.entityId)) throw invalid("Department must belong to one of the user's entities");
  }
  return roles;
}

async function userSnapshot(tx: DB, id: string) {
  const u = await tx.user.findUnique({
    where: { id },
    include: { department: true, entities: { include: { entity: true } }, roles: { include: { role: true, entity: true } } },
  });
  if (!u) return null;
  return {
    email: u.email,
    name: u.name,
    jobTitle: u.jobTitle,
    department: u.department?.name ?? null,
    isActive: u.isActive,
    entities: u.entities.map((e) => e.entity.code).sort(),
    roles: u.roles.map((r) => `${r.role.key}${r.entity ? `@${r.entity.code}` : ""}`).sort(),
  };
}

export async function createUser(tx: Tx, actor: Actor, raw: UserInput) {
  assertAnyEntity(actor, "admin.users");
  const input = userInputSchema.parse(raw);
  await checkRoleAssignment(tx, actor, input);
  if (await tx.user.findUnique({ where: { email: input.email } })) throw invalid("A user with this email already exists", { email: "Already exists" });
  const u = await tx.user.create({
    data: {
      email: input.email,
      name: input.name,
      jobTitle: input.jobTitle || null,
      phone: input.phone || null,
      departmentId: input.departmentId ?? null,
      canEditProfile: input.canEditProfile,
      entities: { create: input.entityIds.map((entityId) => ({ entityId })) },
      roles: { create: input.roles.map((r) => ({ roleId: r.roleId, entityId: r.entityId })) },
    },
  });
  const token = await issueUserToken(tx, u.id, "INVITE", 24 * 7);
  await audit(tx, { actor, action: "USER_CREATED", targetType: "User", targetId: u.id, summary: `User ${u.email} created and invited`, after: await userSnapshot(tx, u.id) });
  return { user: u, inviteToken: token };
}

export async function updateUser(tx: Tx, actor: Actor, id: string, raw: UserInput) {
  assertAnyEntity(actor, "admin.users");
  const input = userInputSchema.parse(raw);
  const existing = await tx.user.findUnique({ where: { id }, include: { roles: { include: { role: true } }, entities: true } });
  if (!existing) throw notFound();
  // an admin may only edit users who share an entity they administer
  if (!existing.entities.some((e) => can(actor, "admin.users", e.entityId)) && existing.entities.length > 0) throw forbidden();
  await checkRoleAssignment(tx, actor, input);
  if (existing.roles.some((r) => r.role.key === "SYSTEM_ADMIN") && !isAdmin(actor)) throw forbidden("Only a System Administrator can edit an administrator");
  if (id === actor.id) {
    const keepsAdmin = (await tx.role.findMany({ where: { id: { in: input.roles.map((r) => r.roleId) } } })).some((r) => r.key === "SYSTEM_ADMIN");
    if (isAdmin(actor) && !keepsAdmin) throw invalid("You cannot remove your own administrator role");
  }
  if (input.email !== existing.email && (await tx.user.findUnique({ where: { email: input.email } }))) throw invalid("Email already in use", { email: "Already exists" });

  const before = await userSnapshot(tx, id);
  await tx.userRole.deleteMany({ where: { userId: id } });
  await tx.userEntity.deleteMany({ where: { userId: id } });
  await tx.user.update({
    where: { id },
    data: {
      email: input.email,
      name: input.name,
      jobTitle: input.jobTitle || null,
      phone: input.phone || null,
      departmentId: input.departmentId ?? null,
      canEditProfile: input.canEditProfile,
      entities: { create: input.entityIds.map((entityId) => ({ entityId })) },
      roles: { create: input.roles.map((r) => ({ roleId: r.roleId, entityId: r.entityId })) },
    },
  });
  const after = await userSnapshot(tx, id);
  const rolesChanged = JSON.stringify(before?.roles) !== JSON.stringify(after?.roles);
  await audit(tx, {
    actor,
    action: rolesChanged ? "USER_ROLE_CHANGED" : "USER_UPDATED",
    targetType: "User",
    targetId: id,
    summary: `User ${input.email} updated${rolesChanged ? " (roles changed)" : ""}`,
    before,
    after,
  });
  if (rolesChanged) await tx.session.deleteMany({ where: { userId: id, NOT: { userId: actor.id } } });
}

export async function setUserActive(tx: Tx, actor: Actor, id: string, active: boolean) {
  assertAnyEntity(actor, "admin.users");
  if (id === actor.id) throw invalid("You cannot deactivate your own account");
  const u = await tx.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
  if (!u) throw notFound();
  if (u.roles.some((r) => r.role.key === "SYSTEM_ADMIN") && !isAdmin(actor)) throw forbidden();
  await tx.user.update({ where: { id }, data: { isActive: active } });
  if (!active) await tx.session.deleteMany({ where: { userId: id } });
  await audit(tx, { actor, action: active ? "USER_ACTIVATED" : "USER_DEACTIVATED", targetType: "User", targetId: id, summary: `User ${u.email} ${active ? "activated" : "deactivated"}`, before: { isActive: u.isActive }, after: { isActive: active } });
}

export async function issueResetLink(tx: Tx, actor: Actor, id: string) {
  assertAnyEntity(actor, "admin.users");
  const u = await tx.user.findUnique({ where: { id } });
  if (!u) throw notFound();
  const purpose: "INVITE" | "PASSWORD_RESET" = u.passwordHash ? "PASSWORD_RESET" : "INVITE";
  const token = await issueUserToken(tx, id, purpose, purpose === "INVITE" ? 24 * 7 : 24);
  await audit(tx, { actor, action: purpose === "INVITE" ? "USER_INVITE_REISSUED" : "PASSWORD_RESET_ISSUED", targetType: "User", targetId: id, summary: `${purpose === "INVITE" ? "Invitation" : "Password reset link"} issued for ${u.email}` });
  return { token, purpose, user: u };
}

export async function updateOwnProfile(tx: Tx, actor: Actor, input: { name: string; jobTitle: string; phone: string }) {
  const u = await tx.user.findUnique({ where: { id: actor.id } });
  if (!u) throw notFound();
  const phone = z.string().trim().max(40).parse(input.phone ?? "");
  const data: { phone: string | null; name?: string; jobTitle?: string | null } = { phone: phone || null };
  if (u.canEditProfile) {
    data.name = z.string().trim().min(2).max(120).parse(input.name);
    data.jobTitle = z.string().trim().max(120).parse(input.jobTitle) || null;
  }
  await tx.user.update({ where: { id: actor.id }, data });
  await audit(tx, { actor, action: "PROFILE_UPDATED", targetType: "User", targetId: actor.id, summary: `${u.email} updated their profile`, before: { name: u.name, jobTitle: u.jobTitle, phone: u.phone }, after: data });
}

// ───────────────────────────── Departments & categories ─────────────────────────────

export const departmentSchema = z.object({
  entityId: uuid,
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(20).optional().default(""),
  isActive: z.boolean().default(true),
});

export async function saveDepartment(tx: Tx, actor: Actor, id: string | null, raw: z.input<typeof departmentSchema>) {
  const input = departmentSchema.parse(raw);
  assertCan(actor, "admin.departments", input.entityId);
  const dup = await tx.department.findFirst({ where: { entityId: input.entityId, name: { equals: input.name, mode: "insensitive" }, NOT: id ? { id } : undefined } });
  if (dup) throw invalid("A department with this name already exists", { name: "Duplicate" });
  if (id) {
    const before = await tx.department.findUnique({ where: { id } });
    if (!before || before.entityId !== input.entityId) throw notFound();
    const d = await tx.department.update({ where: { id }, data: { name: input.name, code: input.code || null, isActive: input.isActive } });
    await audit(tx, { actor, action: "DEPARTMENT_UPDATED", targetType: "Department", targetId: id, entityId: input.entityId, summary: `Department "${d.name}" updated`, before, after: d });
    return d;
  }
  const d = await tx.department.create({ data: { entityId: input.entityId, name: input.name, code: input.code || null, isActive: input.isActive } });
  await audit(tx, { actor, action: "DEPARTMENT_CREATED", targetType: "Department", targetId: d.id, entityId: input.entityId, summary: `Department "${d.name}" created`, after: d });
  return d;
}

export const categorySchema = z.object({
  entityId: uuid,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().default(""),
  level1ApproverId: optUuid,
  level1Label: z.string().trim().max(120).optional().default(""),
  isActive: z.boolean().default(true),
});

export async function saveCategory(tx: Tx, actor: Actor, id: string | null, raw: z.input<typeof categorySchema>) {
  const input = categorySchema.parse(raw);
  assertCan(actor, "admin.categories", input.entityId);
  const dup = await tx.category.findFirst({ where: { entityId: input.entityId, name: { equals: input.name, mode: "insensitive" }, NOT: id ? { id } : undefined } });
  if (dup) throw invalid("A category with this name already exists", { name: "Duplicate" });
  if (input.level1ApproverId) {
    const u = await tx.user.findFirst({ where: { id: input.level1ApproverId, isActive: true, entities: { some: { entityId: input.entityId } } } });
    if (!u) throw invalid("Level 1 approver must be an active member of this entity", { level1ApproverId: "Invalid approver" });
  }
  const data = {
    name: input.name,
    description: input.description || null,
    level1ApproverId: input.level1ApproverId ?? null,
    level1Label: input.level1Label || null,
    isActive: input.isActive,
  };
  if (id) {
    const before = await tx.category.findUnique({ where: { id }, include: { level1Approver: { select: { name: true } } } });
    if (!before || before.entityId !== input.entityId) throw notFound();
    const c = await tx.category.update({ where: { id }, data, include: { level1Approver: { select: { name: true } } } });
    const approverChanged = before.level1ApproverId !== c.level1ApproverId;
    await audit(tx, {
      actor,
      action: approverChanged ? "CATEGORY_APPROVER_CHANGED" : "CATEGORY_UPDATED",
      targetType: "Category",
      targetId: id,
      entityId: input.entityId,
      summary: `Category "${c.name}" updated${approverChanged ? ` (Level 1 approver: ${before.level1Approver?.name ?? "—"} → ${c.level1Approver?.name ?? "—"})` : ""}`,
      before: { ...before, level1Approver: before.level1Approver?.name },
      after: { ...c, level1Approver: c.level1Approver?.name },
    });
    return c;
  }
  const c = await tx.category.create({ data: { entityId: input.entityId, ...data } });
  await audit(tx, { actor, action: "CATEGORY_CREATED", targetType: "Category", targetId: c.id, entityId: input.entityId, summary: `Category "${c.name}" created`, after: c });
  return c;
}

// ───────────────────────────── Workflows ─────────────────────────────

export const workflowSchema = z.object({
  entityId: uuid,
  name: z.string().trim().min(2).max(120),
  resubmitRule: z.enum(["RETURNING_STAGE", "FIRST_STAGE"]),
  isActive: z.boolean().default(true),
  stages: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(120),
        statusKey: z.enum(["PENDING_LEVEL1", "PENDING_FINANCE", "PENDING_FINAL", "PENDING_APPROVAL"]),
        approverType: z.enum(["CATEGORY_APPROVER", "ROLE", "USER"]),
        roleId: optUuid,
        userId: optUuid,
        requireCommentOnApprove: z.boolean().default(false),
        escalationHours: z.number().int().min(1).max(24 * 60).nullable().optional(),
      }),
    )
    .min(1, "At least one approval stage is required")
    .max(10),
});

export async function saveWorkflow(tx: Tx, actor: Actor, id: string | null, raw: z.input<typeof workflowSchema>) {
  const input = workflowSchema.parse(raw);
  assertCan(actor, "admin.workflows", input.entityId);
  input.stages.forEach((s, i) => {
    if (s.approverType === "ROLE" && !s.roleId) throw invalid(`Stage ${i + 1}: select a role`);
    if (s.approverType === "USER" && !s.userId) throw invalid(`Stage ${i + 1}: select a user`);
  });
  const stagesData = input.stages.map((s, i) => ({
    stageOrder: i + 1,
    name: s.name,
    statusKey: s.statusKey,
    approverType: s.approverType,
    roleId: s.approverType === "ROLE" ? s.roleId! : null,
    userId: s.approverType === "USER" ? s.userId! : null,
    requireCommentOnApprove: s.requireCommentOnApprove,
    escalationHours: s.escalationHours ?? null,
  }));
  let wf;
  if (id) {
    const before = await tx.approvalWorkflow.findUnique({ where: { id }, include: { stages: { orderBy: { stageOrder: "asc" } } } });
    if (!before || before.entityId !== input.entityId) throw notFound();
    await tx.approvalWorkflowStage.deleteMany({ where: { workflowId: id } });
    wf = await tx.approvalWorkflow.update({
      where: { id },
      data: { name: input.name, resubmitRule: input.resubmitRule, isActive: input.isActive, version: { increment: 1 }, stages: { create: stagesData } },
      include: { stages: true },
    });
    await audit(tx, {
      actor,
      action: "WORKFLOW_CHANGED",
      targetType: "ApprovalWorkflow",
      targetId: id,
      entityId: input.entityId,
      summary: `Workflow "${wf.name}" updated to version ${wf.version}. Existing requests keep their original approval routing.`,
      before: { name: before.name, resubmitRule: before.resubmitRule, isActive: before.isActive, stages: before.stages },
      after: { name: wf.name, resubmitRule: wf.resubmitRule, isActive: wf.isActive, stages: wf.stages },
    });
  } else {
    wf = await tx.approvalWorkflow.create({
      data: { entityId: input.entityId, name: input.name, resubmitRule: input.resubmitRule, isActive: input.isActive, stages: { create: stagesData } },
      include: { stages: true },
    });
    await audit(tx, { actor, action: "WORKFLOW_CREATED", targetType: "ApprovalWorkflow", targetId: wf.id, entityId: input.entityId, summary: `Workflow "${wf.name}" created`, after: wf });
  }
  if (input.isActive) {
    // only one active workflow per entity
    await tx.approvalWorkflow.updateMany({ where: { entityId: input.entityId, id: { not: wf.id }, isActive: true }, data: { isActive: false } });
  }
  return wf;
}

// ───────────────────────────── Entities ─────────────────────────────

export const entitySchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/, "2–10 letters/digits"),
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(200).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  prNumberFormat: z.string().trim().max(60).refine((v) => v.includes("{SEQ}"), "Format must include {SEQ}"),
  sequencePadding: z.number().int().min(3).max(8),
  currencyMode: z.enum(["SINGLE", "MULTI"]),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
  allowedCurrencies: z.array(z.string().regex(/^[A-Z]{3}$/)).min(1),
  allowSelfApproval: z.boolean(),
  emailNotifications: z.boolean(),
  pdfFooterText: z.string().trim().max(300).optional().default(""),
  isActive: z.boolean(),
  isConfigured: z.boolean(),
});

export async function saveEntity(tx: Tx, actor: Actor, id: string | null, raw: z.input<typeof entitySchema>) {
  const input = entitySchema.parse(raw);
  if (!input.allowedCurrencies.includes(input.defaultCurrency)) throw invalid("Default currency must be one of the allowed currencies");
  const data = { ...input, legalName: input.legalName || null, address: input.address || null, pdfFooterText: input.pdfFooterText || null };
  if (id) {
    assertCan(actor, "admin.entities", id);
    const before = await tx.entity.findUnique({ where: { id } });
    if (!before) throw notFound();
    if (before.code !== input.code && (await tx.purchaseRequest.count({ where: { entityId: id, prNumber: { not: null } } })) > 0)
      throw invalid("The entity code cannot change after PR numbers have been issued");
    const e = await tx.entity.update({ where: { id }, data });
    await audit(tx, { actor, action: "ENTITY_SETTINGS_CHANGED", targetType: "Entity", targetId: id, entityId: id, summary: `Entity ${e.code} settings updated`, before, after: e });
    return e;
  }
  if (!isAdmin(actor)) throw forbidden("Only a System Administrator can create entities");
  if (await tx.entity.findUnique({ where: { code: input.code } })) throw invalid("Entity code already exists", { code: "Duplicate" });
  const e = await tx.entity.create({ data });
  // creator gets access to the new entity
  await tx.userEntity.create({ data: { userId: actor.id, entityId: e.id } });
  await audit(tx, { actor, action: "ENTITY_CREATED", targetType: "Entity", targetId: e.id, entityId: e.id, summary: `Entity ${e.code} created`, after: e });
  return e;
}

export async function setEntityLogo(tx: Tx, actor: Actor, id: string, logoKey: string) {
  assertCan(actor, "admin.entities", id);
  const before = await tx.entity.findUnique({ where: { id } });
  if (!before) throw notFound();
  await tx.entity.update({ where: { id }, data: { logoKey } });
  await audit(tx, { actor, action: "ENTITY_SETTINGS_CHANGED", targetType: "Entity", targetId: id, entityId: id, summary: `Entity ${before.code} logo updated`, before: { logoKey: before.logoKey }, after: { logoKey } });
}

// ───────────────────────────── Roles & permissions ─────────────────────────────

export async function setRolePermissions(tx: Tx, actor: Actor, roleId: string, permissionKeys: string[]) {
  if (!isAdmin(actor)) throw forbidden("Only a System Administrator can change role permissions");
  const role = await tx.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
  if (!role) throw notFound();
  const valid = permissionKeys.filter((k) => k in PERMISSIONS);
  if (role.key === "SYSTEM_ADMIN" && !valid.includes("admin.roles")) throw invalid("The System Administrator role must keep 'admin.roles'");
  const perms = await tx.permission.findMany({ where: { key: { in: valid } } });
  await tx.rolePermission.deleteMany({ where: { roleId } });
  await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) });
  await audit(tx, {
    actor,
    action: "ROLE_PERMISSIONS_CHANGED",
    targetType: "Role",
    targetId: roleId,
    summary: `Permissions of role "${role.name}" updated`,
    before: role.permissions.map((p) => p.permission.key).sort(),
    after: valid.sort(),
  });
}

export async function createRole(tx: Tx, actor: Actor, raw: { key: string; name: string; description?: string }) {
  if (!isAdmin(actor)) throw forbidden();
  const input = z
    .object({ key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{2,40}$/, "Use UPPER_SNAKE_CASE"), name: z.string().trim().min(2).max(80), description: z.string().trim().max(300).optional() })
    .parse(raw);
  if (await tx.role.findUnique({ where: { key: input.key } })) throw invalid("Role key already exists", { key: "Duplicate" });
  const r = await tx.role.create({ data: { key: input.key, name: input.name, description: input.description || null } });
  await audit(tx, { actor, action: "ROLE_CREATED", targetType: "Role", targetId: r.id, summary: `Role "${r.name}" created`, after: r });
  return r;
}

// ───────────────────────────── System settings ─────────────────────────────

export const SETTINGS_DEFAULTS = {
  appName: "Purchase Request & Approval System",
  companyName: "Imperial EdTech",
  supportEmail: "",
  pdfShowComments: true,
  overdueHighlightHours: 48,
};
export type SystemSettings = typeof SETTINGS_DEFAULTS;

export async function getSettings(db: DB): Promise<SystemSettings> {
  const rows = await db.systemSetting.findMany();
  const out: Record<string, unknown> = { ...SETTINGS_DEFAULTS };
  for (const r of rows) if (r.key in SETTINGS_DEFAULTS) out[r.key] = r.value;
  return out as SystemSettings;
}

export async function saveSettings(tx: Tx, actor: Actor, raw: Partial<SystemSettings>) {
  assertAnyEntity(actor, "admin.settings");
  const input = z
    .object({
      appName: z.string().trim().min(2).max(100),
      companyName: z.string().trim().min(2).max(100),
      supportEmail: z.string().trim().max(200),
      pdfShowComments: z.boolean(),
      overdueHighlightHours: z.number().int().min(1).max(720),
    })
    .parse(raw);
  const before = await getSettings(tx);
  for (const [key, value] of Object.entries(input)) {
    await tx.systemSetting.upsert({ where: { key }, update: { value, updatedById: actor.id }, create: { key, value, updatedById: actor.id } });
  }
  await audit(tx, { actor, action: "SYSTEM_SETTINGS_CHANGED", targetType: "SystemSetting", summary: "System settings updated", before, after: input });
}
