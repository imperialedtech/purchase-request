import type { DB } from "../db";
import { forbidden } from "../errors";
import type { PermissionKey } from "./permissions";

export type RoleGrant = {
  roleId: string;
  roleKey: string;
  roleName: string;
  entityId: string | null; // null = all of the user's entities
  permissions: Set<string>;
};

/** The authenticated principal every service call is evaluated against. */
export type Actor = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  canEditProfile: boolean;
  entityIds: string[];
  grants: RoleGrant[];
};

export async function loadActor(db: DB, userId: string): Promise<Actor | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    include: {
      department: true,
      entities: { include: { entity: true } },
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  });
  if (!u || !u.isActive) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    jobTitle: u.jobTitle,
    departmentId: u.departmentId,
    departmentName: u.department?.name ?? null,
    canEditProfile: u.canEditProfile,
    entityIds: u.entities.filter((e) => e.entity.isActive).map((e) => e.entityId),
    grants: u.roles.map((r) => ({
      roleId: r.roleId,
      roleKey: r.role.key,
      roleName: r.role.name,
      entityId: r.entityId,
      permissions: new Set(r.role.permissions.map((p) => p.permission.key)),
    })),
  };
}

function grantApplies(actor: Actor, g: RoleGrant, entityId?: string) {
  if (entityId === undefined) return true;
  if (!actor.entityIds.includes(entityId)) return false;
  return g.entityId === null || g.entityId === entityId;
}

/** True when the actor holds the permission (optionally within a specific entity). */
export function can(actor: Actor, perm: PermissionKey, entityId?: string): boolean {
  return actor.grants.some((g) => g.permissions.has(perm) && grantApplies(actor, g, entityId));
}

export function assertCan(actor: Actor, perm: PermissionKey, entityId?: string) {
  if (!can(actor, perm, entityId)) throw forbidden();
}

/** Entities in which the actor holds the permission. */
export function entitiesWith(actor: Actor, perm: PermissionKey): string[] {
  return actor.entityIds.filter((e) => can(actor, perm, e));
}

export function hasRoleInEntity(actor: Actor, roleId: string, entityId: string) {
  return actor.grants.some((g) => g.roleId === roleId && grantApplies(actor, g, entityId));
}

export function assertEntityAccess(actor: Actor, entityId: string) {
  if (!actor.entityIds.includes(entityId)) throw forbidden("You do not have access to this entity");
}

export function isAdmin(actor: Actor) {
  return actor.grants.some((g) => g.roleKey === "SYSTEM_ADMIN");
}
