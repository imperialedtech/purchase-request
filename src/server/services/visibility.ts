import type { Prisma } from "@prisma/client";
import { type Actor, can, entitiesWith } from "../auth/actor";

/**
 * Row-level visibility for purchase requests — the single source of truth used by every
 * list, dashboard, report and detail query. A user can see:
 *  - their own requests (including drafts), in entities they belong to;
 *  - non-draft requests in entities where they hold `pr.view_all`;
 *  - non-draft requests where they are (or were) an assigned approver, directly or via role.
 * Drafts are private to the requester.
 */
export function visibleRequestsWhere(actor: Actor): Prisma.PurchaseRequestWhereInput {
  const or: Prisma.PurchaseRequestWhereInput[] = [{ requesterId: actor.id }];

  const viewAll = entitiesWith(actor, "pr.view_all");
  if (viewAll.length) or.push({ entityId: { in: viewAll }, status: { not: "DRAFT" } });

  or.push({ status: { not: "DRAFT" }, stages: { some: { assignedUserId: actor.id } } });

  for (const g of actor.grants) {
    const stageMatch = { stages: { some: { assignedRoleId: g.roleId, assignedUserId: null } } };
    if (g.entityId === null) or.push({ status: { not: "DRAFT" }, ...stageMatch });
    else if (actor.entityIds.includes(g.entityId)) or.push({ entityId: g.entityId, status: { not: "DRAFT" }, ...stageMatch });
  }

  return { AND: [{ entityId: { in: actor.entityIds } }, { OR: or }] };
}

/** Whether restricted payment details may be shown to this actor for a given request. */
export function canSeePaymentDetails(
  actor: Actor,
  pr: { requesterId: string; entityId: string; stages: { assignedUserId: string | null; assignedRoleId: string | null }[] },
) {
  if (pr.requesterId === actor.id) return true;
  if (can(actor, "pr.view_payment_details", pr.entityId)) return true;
  return pr.stages.some(
    (s) =>
      s.assignedUserId === actor.id ||
      (s.assignedUserId === null &&
        s.assignedRoleId !== null &&
        actor.grants.some((g) => g.roleId === s.assignedRoleId && (g.entityId === null || g.entityId === pr.entityId))),
  );
}

/** Whether the actor is the eligible approver for a specific stage. */
export function isStageApprover(
  actor: Actor,
  entityId: string,
  stage: { assignedUserId: string | null; assignedRoleId: string | null },
) {
  if (!actor.entityIds.includes(entityId)) return false;
  if (!can(actor, "approval.act", entityId)) return false;
  if (stage.assignedUserId) return stage.assignedUserId === actor.id;
  if (stage.assignedRoleId)
    return actor.grants.some((g) => g.roleId === stage.assignedRoleId && (g.entityId === null || g.entityId === entityId));
  return false;
}

/** Where-clause for "requests awaiting my approval". */
export function awaitingMyApprovalWhere(actor: Actor): Prisma.PurchaseRequestWhereInput {
  const actEntities = entitiesWith(actor, "approval.act");
  if (actEntities.length === 0) return { id: "00000000-0000-0000-0000-000000000000" };
  const stageOr: Prisma.PurchaseRequestStageWhereInput[] = [{ assignedUserId: actor.id }];
  for (const g of actor.grants) {
    stageOr.push({ assignedUserId: null, assignedRoleId: g.roleId, ...(g.entityId ? { request: { entityId: g.entityId } } : {}) });
  }
  return {
    entityId: { in: actEntities },
    status: { in: ["PENDING_LEVEL1", "PENDING_FINANCE", "PENDING_FINAL", "PENDING_APPROVAL"] },
    stages: { some: { state: "ACTIVE", OR: stageOr } },
    // self-approval is excluded unless the entity explicitly allows it
    OR: [{ requesterId: { not: actor.id } }, { entity: { allowSelfApproval: true } }],
  };
}
