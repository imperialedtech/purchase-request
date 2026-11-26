import { Prisma, type PRStatus, type PrismaClient } from "@prisma/client";
import type { DB, Tx } from "../db";
import { type Actor, assertCan, can } from "../auth/actor";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { decisionSchema, type DraftInput } from "@/lib/validation";
import { formatTotals, totalsByCurrency } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/status";
import { audit } from "./audit";
import { notify } from "./notifications";
import { saveDraftTx, validateForSubmission, PENDING } from "./requests";
import { isStageApprover } from "./visibility";
import { z } from "zod";

type PRWithItems = Prisma.PurchaseRequestGetPayload<{ include: { items: true; entity: true } }>;

// ───────────────────────────── PR numbering ─────────────────────────────

export function currentYear(d = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "Africa/Lagos" }).format(d));
}

export function formatPrNumber(format: string, code: string, year: number, seq: number, padding: number) {
  return format
    .replace("{CODE}", code)
    .replace("{YEAR}", String(year))
    .replace("{SEQ}", String(seq).padStart(padding, "0"));
}

/**
 * Atomically allocates the next sequence number for an entity/year. The upsert takes a row lock,
 * so concurrent submissions serialize here; prNumber is also UNIQUE in the database.
 */
export async function allocatePrNumber(tx: Tx, entity: { id: string; code: string; prNumberFormat: string; sequencePadding: number }) {
  const year = currentYear();
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "pr_number_sequences" ("entityId", "year", "lastValue")
    VALUES (${entity.id}::uuid, ${year}, 1)
    ON CONFLICT ("entityId", "year") DO UPDATE SET "lastValue" = "pr_number_sequences"."lastValue" + 1
    RETURNING "lastValue"`;
  return formatPrNumber(entity.prNumberFormat, entity.code, year, rows[0]!.lastValue, entity.sequencePadding);
}

// ───────────────────────────── helpers ─────────────────────────────

async function lockRequest(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "purchase_requests" WHERE id = ${id}::uuid FOR UPDATE`;
}

/** Active users who can act on a stage (excluding nobody — callers filter the requester). */
export async function stageApproverIds(db: DB, entityId: string, stage: { assignedUserId: string | null; assignedRoleId: string | null }) {
  if (stage.assignedUserId) {
    const u = await db.user.findFirst({ where: { id: stage.assignedUserId, isActive: true }, select: { id: true } });
    return u ? [u.id] : [];
  }
  if (!stage.assignedRoleId) return [];
  const users = await db.user.findMany({
    where: {
      isActive: true,
      entities: { some: { entityId } },
      roles: { some: { roleId: stage.assignedRoleId, OR: [{ entityId: null }, { entityId }] } },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

async function reassignersFor(db: DB, entityId: string) {
  const users = await db.user.findMany({
    where: {
      isActive: true,
      entities: { some: { entityId } },
      roles: { some: { OR: [{ entityId: null }, { entityId }], role: { permissions: { some: { permission: { key: "approval.reassign" } } } } } },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

function amountText(items: { currency: string; quantity: unknown; unitPrice: unknown }[]) {
  return formatTotals(totalsByCurrency(items.map((i) => ({ currency: i.currency, quantity: String(i.quantity), unitPrice: String(i.unitPrice) }))));
}

function snapshot(pr: PRWithItems & { categoryName?: string | null }) {
  return {
    prNumber: pr.prNumber,
    title: pr.title,
    category: pr.categoryName ?? null,
    comments: pr.comments,
    requesterName: pr.requesterName,
    requesterJobTitle: pr.requesterJobTitle,
    departmentName: pr.departmentName,
    currency: pr.currency,
    totalAmount: pr.totalAmount?.toString() ?? null,
    items: pr.items.map((i) => ({
      lineNo: i.lineNo,
      description: i.description,
      specifications: i.specifications,
      quantity: i.quantity.toString(),
      currency: i.currency,
      unitPrice: i.unitPrice.toString(),
      lineTotal: i.lineTotal.toString(),
    })),
  };
}

async function notifyStageApprovers(tx: Tx, pr: PRWithItems, stage: { name: string; assignedUserId: string | null; assignedRoleId: string | null }, resubmitted: boolean) {
  const ids = (await stageApproverIds(tx, pr.entityId, stage)).filter((id) => id !== pr.requesterId || pr.entity.allowSelfApproval);
  const lines: [string, string][] = [
    ["PR number", pr.prNumber ?? ""],
    ["Requestor", pr.requesterName],
    ["Amount", amountText(pr.items)],
    ["Approval stage", stage.name],
    ["Action required", "Review and approve, reject or request clarification"],
  ];
  const out = await notify(tx, {
    userIds: ids,
    type: "APPROVAL_REQUIRED",
    title: `${resubmitted ? "Resubmitted — approval" : "Approval"} required: ${pr.prNumber}`,
    body: `${pr.requesterName} ${resubmitted ? "resubmitted" : "submitted"} "${pr.title}" (${amountText(pr.items)}). Your approval is required as ${stage.name}.`,
    requestId: pr.id,
    emailLines: lines,
  });
  if (ids.length === 0) {
    // nobody can act (e.g. only approver is the requester) → alert administrators
    out.push(
      ...(await notify(tx, {
        userIds: await reassignersFor(tx, pr.entityId),
        type: "APPROVER_REASSIGNED",
        title: `Approver needed: ${pr.prNumber}`,
        body: `No eligible approver is available for the "${stage.name}" stage of ${pr.prNumber}. Please reassign the approver.`,
        requestId: pr.id,
        emailLines: lines,
      })),
    );
  }
  return out;
}

// ───────────────────────────── submission ─────────────────────────────

export type SubmitResult = { requestId: string; prNumber: string; status: PRStatus; stageName: string; approverNames: string[]; notificationIds: string[] };

export async function submitRequestTx(tx: Tx, actor: Actor, requestId: string, opts: { confirmed: boolean }): Promise<SubmitResult> {
  if (!opts.confirmed) throw invalid("Please confirm the submission declaration");
  await lockRequest(tx, requestId);
  const pr = await tx.purchaseRequest.findUnique({ where: { id: requestId }, include: { items: { orderBy: { lineNo: "asc" } }, entity: true, category: true, stages: true } });
  if (!pr) throw notFound();
  if (pr.requesterId !== actor.id) throw forbidden("Only the requestor can submit this purchase request");
  assertCan(actor, "pr.create", pr.entityId);
  if (pr.status !== "DRAFT" && pr.status !== "RETURNED") throw conflict(`This request is already ${STATUS_LABEL[pr.status].toLowerCase()}`);
  if (!pr.entity.isConfigured) throw invalid(`${pr.entity.name} is not configured for purchase requests yet`);
  validateForSubmission(pr);
  if (pr.category && !pr.category.isActive) throw invalid("The selected category is no longer active", { categoryId: "Inactive category" });

  const now = new Date();
  const resubmission = pr.status === "RETURNED";
  const prNumber = pr.prNumber ?? (await allocatePrNumber(tx, pr.entity));
  const revision = pr.revision + 1;

  let stages = pr.stages.sort((a, b) => a.stageOrder - b.stageOrder);
  let target: (typeof stages)[number];

  if (!resubmission) {
    // Snapshot the active workflow into per-request approval assignments.
    const wf = await tx.approvalWorkflow.findFirst({
      where: { entityId: pr.entityId, isActive: true },
      include: { stages: { orderBy: { stageOrder: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });
    if (!wf || wf.stages.length === 0) throw invalid("No approval workflow is configured for this entity. Contact the administrator.");
    const data: Prisma.PurchaseRequestStageCreateManyInput[] = [];
    for (const s of wf.stages) {
      let assignedUserId: string | null = null;
      let assignedRoleId: string | null = null;
      if (s.approverType === "CATEGORY_APPROVER") {
        if (!pr.category?.level1ApproverId)
          throw invalid(`No ${s.name} approver is configured for the "${pr.category?.name ?? "selected"}" category. Contact the administrator.`);
        assignedUserId = pr.category.level1ApproverId;
      } else if (s.approverType === "USER") {
        if (!s.userId) throw invalid(`Workflow stage "${s.name}" has no approver configured`);
        assignedUserId = s.userId;
      } else {
        if (!s.roleId) throw invalid(`Workflow stage "${s.name}" has no role configured`);
        assignedRoleId = s.roleId;
      }
      const eligible = await stageApproverIds(tx, pr.entityId, { assignedUserId, assignedRoleId });
      if (eligible.length === 0) throw invalid(`No active approver is available for the "${s.name}" stage. Contact the administrator.`);
      data.push({
        requestId: pr.id,
        stageOrder: s.stageOrder,
        name: s.name,
        statusKey: s.statusKey,
        approverType: s.approverType,
        assignedUserId,
        assignedRoleId,
        requireCommentOnApprove: s.requireCommentOnApprove,
        escalationHours: s.escalationHours,
      });
    }
    await tx.purchaseRequestStage.createMany({ data });
    stages = await tx.purchaseRequestStage.findMany({ where: { requestId: pr.id }, orderBy: { stageOrder: "asc" } });
    target = stages[0]!;
    await tx.purchaseRequest.update({ where: { id: pr.id }, data: { workflowId: wf.id, resubmitRule: wf.resubmitRule } });
  } else {
    const order = pr.resubmitRule === "FIRST_STAGE" ? stages[0]!.stageOrder : (pr.returnedFromStage ?? stages[0]!.stageOrder);
    target = stages.find((s) => s.stageOrder === order) ?? stages[0]!;
    // stages from the target onward wait again; earlier approvals remain recorded in history
    await tx.purchaseRequestStage.updateMany({
      where: { requestId: pr.id, stageOrder: { gte: target.stageOrder } },
      data: { state: "WAITING", completedAt: null, activatedAt: null },
    });
  }

  await tx.purchaseRequestStage.update({ where: { id: target.id }, data: { state: "ACTIVE", activatedAt: now } });

  const updated = await tx.purchaseRequest.update({
    where: { id: pr.id },
    data: {
      prNumber,
      status: target.statusKey,
      currentStageOrder: target.stageOrder,
      returnedFromStage: null,
      revision,
      requesterConfirmedAt: now,
      submittedAt: pr.submittedAt ?? now,
      lastSubmittedAt: now,
      // initiator section is frozen at submission from the authenticated profile
      ...(resubmission ? {} : { requesterName: actor.name, requesterJobTitle: actor.jobTitle, departmentId: actor.departmentId, departmentName: actor.departmentName }),
    },
    include: { items: { orderBy: { lineNo: "asc" } }, entity: true },
  });

  await tx.purchaseRequestRevision.create({
    data: { requestId: pr.id, revision, snapshot: snapshot({ ...updated, categoryName: pr.category?.name }) as Prisma.InputJsonValue, createdById: actor.id },
  });

  await audit(tx, {
    actor,
    action: resubmission ? "PR_RESUBMITTED" : "PR_SUBMITTED",
    targetType: "PurchaseRequest",
    targetId: pr.id,
    entityId: pr.entityId,
    requestId: pr.id,
    prNumber,
    summary: `${prNumber} ${resubmission ? "resubmitted" : "submitted"}; routed to ${target.name}`,
    metadata: { revision, stage: target.name, total: amountText(updated.items) },
  });

  const notificationIds = await notifyStageApprovers(tx, updated, target, resubmission);
  notificationIds.push(
    ...(await notify(tx, {
      userIds: [actor.id],
      type: resubmission ? "PR_RESUBMITTED" : "PR_SUBMITTED",
      title: `${prNumber} ${resubmission ? "resubmitted" : "submitted"}`,
      body: `Your purchase request "${updated.title}" was ${resubmission ? "resubmitted" : "submitted"} and is awaiting ${target.name} approval.`,
      requestId: pr.id,
    })),
  );

  const approverIds = await stageApproverIds(tx, pr.entityId, target);
  const names = await tx.user.findMany({ where: { id: { in: approverIds } }, select: { name: true } });
  return { requestId: pr.id, prNumber, status: updated.status, stageName: target.name, approverNames: names.map((n) => n.name), notificationIds };
}

/** Saves the form content and submits in one transaction. */
export async function saveAndSubmit(db: PrismaClient, actor: Actor, input: DraftInput, requestId: string | undefined, confirmed: boolean) {
  return db.$transaction(async (tx) => {
    const pr = await saveDraftTx(tx, actor, input, requestId);
    return submitRequestTx(tx, actor, pr.id, { confirmed });
  });
}

// ───────────────────────────── approval decisions ─────────────────────────────

export type DecisionResult = { status: PRStatus; prNumber: string; nextStage: string | null; notificationIds: string[] };

export async function decideTx(tx: Tx, actor: Actor, raw: z.input<typeof decisionSchema>): Promise<DecisionResult> {
  const input = decisionSchema.parse(raw);
  await lockRequest(tx, input.requestId);
  const pr = await tx.purchaseRequest.findUnique({
    where: { id: input.requestId },
    include: { items: true, entity: true, category: true, stages: { orderBy: { stageOrder: "asc" }, include: { assignedRole: true } } },
  });
  if (!pr) throw notFound();
  if (!actor.entityIds.includes(pr.entityId)) throw notFound();
  if (!(PENDING as readonly string[]).includes(pr.status)) throw conflict(`This request is ${STATUS_LABEL[pr.status].toLowerCase()} and cannot be actioned`);

  const stage = pr.stages.find((s) => s.state === "ACTIVE" && s.stageOrder === pr.currentStageOrder);
  if (!stage) throw conflict("This request has no active approval stage");
  if (!isStageApprover(actor, pr.entityId, stage)) throw forbidden("You are not the assigned approver for the current stage of this request");
  if (pr.requesterId === actor.id && !pr.entity.allowSelfApproval) throw forbidden("You cannot approve your own purchase request");
  if (input.decision === "APPROVED" && stage.requireCommentOnApprove && input.comment.length < 3)
    throw invalid("A comment is required to approve at this stage", { comment: "Comment required" });

  const now = new Date();
  const actorRole =
    stage.assignedRole?.name ?? (stage.approverType === "CATEGORY_APPROVER" && pr.category?.level1Label ? `${stage.name} (${pr.category.level1Label})` : stage.name);
  await tx.purchaseRequestApproval.create({
    data: {
      requestId: pr.id,
      stageId: stage.id,
      stageOrder: stage.stageOrder,
      stageName: stage.name,
      decision: input.decision,
      comment: input.comment || null,
      actorId: actor.id,
      actorName: actor.name,
      actorRole,
      actorJobTitle: actor.jobTitle,
      revision: pr.revision,
    },
  });

  const prNumber = pr.prNumber!;
  const amount = amountText(pr.items);
  const notificationIds: string[] = [];
  let status: PRStatus;
  let nextStage: string | null = null;

  if (input.decision === "APPROVED") {
    await tx.purchaseRequestStage.update({ where: { id: stage.id }, data: { state: "APPROVED", completedAt: now } });
    const next = pr.stages.find((s) => s.stageOrder > stage.stageOrder);
    if (next) {
      await tx.purchaseRequestStage.update({ where: { id: next.id }, data: { state: "ACTIVE", activatedAt: now } });
      status = next.statusKey;
      nextStage = next.name;
      const updated = await tx.purchaseRequest.update({
        where: { id: pr.id },
        data: { status, currentStageOrder: next.stageOrder },
        include: { items: true, entity: true },
      });
      notificationIds.push(...(await notifyStageApprovers(tx, updated, next, false)));
      notificationIds.push(
        ...(await notify(tx, {
          userIds: [pr.requesterId],
          type: "PR_STAGE_APPROVED",
          title: `${prNumber} approved by ${stage.name}`,
          body: `${actor.name} approved your request at the ${stage.name} stage. It is now awaiting ${next.name}.`,
          requestId: pr.id,
          emailLines: [["PR number", prNumber], ["Amount", amount], ["Approved stage", stage.name], ["Next stage", next.name]],
        })),
      );
    } else {
      status = "APPROVED";
      await tx.purchaseRequest.update({
        where: { id: pr.id },
        data: { status, currentStageOrder: null, finalApprovedAt: now, finalApproverId: actor.id, finalApproverName: actor.name },
      });
      notificationIds.push(
        ...(await notify(tx, {
          userIds: [pr.requesterId],
          type: "PR_APPROVED",
          title: `${prNumber} fully approved`,
          body: `Your purchase request "${pr.title}" (${amount}) has received final approval from ${actor.name}.`,
          requestId: pr.id,
          emailLines: [["PR number", prNumber], ["Amount", amount], ["Status", "Approved"]],
        })),
      );
    }
  } else if (input.decision === "REJECTED") {
    status = "REJECTED";
    await tx.purchaseRequestStage.update({ where: { id: stage.id }, data: { state: "REJECTED", completedAt: now } });
    await tx.purchaseRequest.update({
      where: { id: pr.id },
      data: { status, currentStageOrder: null, rejectedAt: now, rejectionReason: input.comment },
    });
    notificationIds.push(
      ...(await notify(tx, {
        userIds: [pr.requesterId],
        type: "PR_REJECTED",
        title: `${prNumber} rejected`,
        body: `${actor.name} (${stage.name}) rejected your request. Reason: ${input.comment}`,
        requestId: pr.id,
        emailLines: [["PR number", prNumber], ["Amount", amount], ["Stage", stage.name], ["Reason", input.comment]],
      })),
    );
  } else {
    status = "RETURNED";
    await tx.purchaseRequestStage.update({ where: { id: stage.id }, data: { state: "RETURNED" } });
    await tx.purchaseRequest.update({
      where: { id: pr.id },
      data: { status, currentStageOrder: null, returnedFromStage: stage.stageOrder },
    });
    notificationIds.push(
      ...(await notify(tx, {
        userIds: [pr.requesterId],
        type: "CLARIFICATION_REQUESTED",
        title: `Clarification requested: ${prNumber}`,
        body: `${actor.name} (${stage.name}) requested clarification: ${input.comment}`,
        requestId: pr.id,
        emailLines: [["PR number", prNumber], ["Amount", amount], ["Stage", stage.name], ["Action required", "Update and resubmit the request"]],
      })),
    );
  }

  const actionName = { APPROVED: "PR_APPROVED_STAGE", REJECTED: "PR_REJECTED", CLARIFICATION_REQUESTED: "PR_CLARIFICATION_REQUESTED" }[input.decision];
  await audit(tx, {
    actor,
    action: status === "APPROVED" ? "PR_FINAL_APPROVED" : actionName,
    targetType: "PurchaseRequest",
    targetId: pr.id,
    entityId: pr.entityId,
    requestId: pr.id,
    prNumber,
    summary: `${prNumber}: ${input.decision.toLowerCase().replace("_", " ")} at ${stage.name} by ${actor.name}`,
    before: { status: pr.status, stage: stage.name },
    after: { status, nextStage },
    metadata: { comment: input.comment || null, revision: pr.revision },
  });

  return { status, prNumber, nextStage, notificationIds };
}

// ───────────────────────────── cancel / reassign / comments ─────────────────────────────

export async function cancelTx(tx: Tx, actor: Actor, requestId: string, reason: string) {
  const r = reason?.trim() ?? "";
  if (r.length < 3) throw invalid("A cancellation reason is required", { reason: "Required" });
  await lockRequest(tx, requestId);
  const pr = await tx.purchaseRequest.findUnique({ where: { id: requestId }, include: { stages: true } });
  if (!pr || !actor.entityIds.includes(pr.entityId)) throw notFound();
  const isOwner = pr.requesterId === actor.id;
  if (!isOwner && !can(actor, "pr.cancel_any", pr.entityId)) throw forbidden("You cannot cancel this request");
  if (["APPROVED", "REJECTED", "CANCELLED"].includes(pr.status)) throw conflict("This request can no longer be cancelled");
  const now = new Date();
  await tx.purchaseRequestStage.updateMany({ where: { requestId, state: "ACTIVE" }, data: { state: "WAITING" } });
  await tx.purchaseRequest.update({
    where: { id: requestId },
    data: { status: "CANCELLED", cancelledAt: now, cancelledById: actor.id, cancelReason: r, currentStageOrder: null },
  });
  await audit(tx, {
    actor,
    action: "PR_CANCELLED",
    targetType: "PurchaseRequest",
    targetId: pr.id,
    entityId: pr.entityId,
    requestId: pr.id,
    prNumber: pr.prNumber,
    summary: `${pr.prNumber ?? `Draft "${pr.title}"`} cancelled by ${actor.name}`,
    before: { status: pr.status },
    after: { status: "CANCELLED" },
    metadata: { reason: r },
  });
  const recipients = new Set<string>();
  if (!isOwner) recipients.add(pr.requesterId);
  const active = pr.stages.find((s) => s.state === "ACTIVE");
  if (active) for (const id of await stageApproverIds(tx, pr.entityId, active)) recipients.add(id);
  recipients.delete(actor.id);
  return notify(tx, {
    userIds: [...recipients],
    type: "PR_CANCELLED",
    title: `${pr.prNumber ?? pr.title} cancelled`,
    body: `${actor.name} cancelled the purchase request. Reason: ${r}`,
    requestId: pr.id,
  });
}

export async function reassignTx(tx: Tx, actor: Actor, requestId: string, stageId: string, newUserId: string, reason: string) {
  await lockRequest(tx, requestId);
  const pr = await tx.purchaseRequest.findUnique({ where: { id: requestId }, include: { stages: { include: { assignedUser: true, assignedRole: true } }, items: true, entity: true } });
  if (!pr || !actor.entityIds.includes(pr.entityId)) throw notFound();
  assertCan(actor, "approval.reassign", pr.entityId);
  if (!(PENDING as readonly string[]).includes(pr.status)) throw conflict("Only pending requests can be reassigned");
  const stage = pr.stages.find((s) => s.id === stageId);
  if (!stage || stage.state === "APPROVED" || stage.state === "REJECTED") throw invalid("This stage cannot be reassigned");
  if (!reason?.trim()) throw invalid("A reason is required", { reason: "Required" });
  const target = await tx.user.findFirst({
    where: { id: newUserId, isActive: true, entities: { some: { entityId: pr.entityId } } },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  if (!target) throw invalid("Selected approver is not an active member of this entity");
  if (!target.roles.some((r) => (r.entityId === null || r.entityId === pr.entityId) && r.role.permissions.some((p) => p.permission.key === "approval.act")))
    throw invalid("Selected user does not hold an approver role");
  if (target.id === pr.requesterId && !pr.entity.allowSelfApproval) throw invalid("The requestor cannot be assigned as an approver of their own request");

  const before = stage.assignedUser?.name ?? stage.assignedRole?.name ?? null;
  await tx.purchaseRequestStage.update({ where: { id: stage.id }, data: { assignedUserId: target.id, assignedRoleId: null } });
  await audit(tx, {
    actor,
    action: "APPROVER_CHANGED",
    targetType: "PurchaseRequest",
    targetId: pr.id,
    entityId: pr.entityId,
    requestId: pr.id,
    prNumber: pr.prNumber,
    summary: `${pr.prNumber}: ${stage.name} approver changed from ${before ?? "—"} to ${target.name}`,
    before: { approver: before },
    after: { approver: target.name },
    metadata: { reason, stage: stage.name },
  });
  const ids = await notify(tx, {
    userIds: [target.id, pr.requesterId],
    type: "APPROVER_REASSIGNED",
    title: `Approver reassigned: ${pr.prNumber}`,
    body: `${target.name} is now the ${stage.name} approver for ${pr.prNumber}.${stage.state === "ACTIVE" ? " Action is required." : ""}`,
    requestId: pr.id,
    emailLines: [["PR number", pr.prNumber ?? ""], ["Requestor", pr.requesterName], ["Amount", amountText(pr.items)], ["Approval stage", stage.name]],
  });
  return ids;
}

export async function addCommentTx(tx: Tx, actor: Actor, requestId: string, body: string, visibleWhere: Prisma.PurchaseRequestWhereInput) {
  const text = body?.trim() ?? "";
  if (text.length < 1 || text.length > 4000) throw invalid("Comment must be between 1 and 4000 characters");
  const pr = await tx.purchaseRequest.findFirst({ where: { AND: [{ id: requestId }, visibleWhere] }, include: { stages: true } });
  if (!pr) throw notFound();
  if (pr.status === "DRAFT") throw invalid("Comments are available once the request is submitted");
  const kind = pr.status === "RETURNED" && pr.requesterId === actor.id ? "CLARIFICATION_RESPONSE" : "COMMENT";
  await tx.purchaseRequestComment.create({ data: { requestId, authorId: actor.id, authorName: actor.name, body: text, kind } });
  await audit(tx, {
    actor,
    action: "PR_COMMENT_ADDED",
    targetType: "PurchaseRequest",
    targetId: pr.id,
    entityId: pr.entityId,
    requestId: pr.id,
    prNumber: pr.prNumber,
    summary: `Comment added to ${pr.prNumber}`,
  });
  // notify the requester and everyone involved in the approval chain so far
  const recipients = new Set<string>([pr.requesterId]);
  for (const s of pr.stages.filter((s) => s.state !== "WAITING")) for (const id of await stageApproverIds(tx, pr.entityId, s)) recipients.add(id);
  recipients.delete(actor.id);
  return notify(tx, {
    userIds: [...recipients],
    type: "COMMENT_ADDED",
    title: `New comment on ${pr.prNumber}`,
    body: `${actor.name}: ${text.slice(0, 200)}`,
    requestId: pr.id,
  });
}

