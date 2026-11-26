import { Prisma } from "@prisma/client";
import type { DB, Tx } from "../db";
import { type Actor, assertCan, assertEntityAccess, can } from "../auth/actor";
import { forbidden, invalid, notFound } from "../errors";
import { draftSchema, submitSchema, type DraftInput } from "@/lib/validation";
import { lineTotal, totalsByCurrency } from "@/lib/money";
import { audit } from "./audit";
import { canSeePaymentDetails, isStageApprover, visibleRequestsWhere } from "./visibility";
import { ZodError } from "zod";

export const EDITABLE_STATUSES = ["DRAFT", "RETURNED"] as const;
export const PENDING = ["PENDING_LEVEL1", "PENDING_FINANCE", "PENDING_FINAL", "PENDING_APPROVAL"] as const;

type ParsedDraft = ReturnType<typeof draftSchema.parse>;

async function validateAgainstEntity(db: DB, d: ParsedDraft) {
  const entity = await db.entity.findUnique({ where: { id: d.entityId } });
  if (!entity || !entity.isActive) throw invalid("Entity not available");
  if (!entity.isConfigured)
    throw invalid(`${entity.name} is not yet configured for purchase requests. Contact the system administrator.`);

  if (d.categoryId) {
    const cat = await db.category.findFirst({ where: { id: d.categoryId, entityId: entity.id, isActive: true } });
    if (!cat) throw invalid("Selected category is not valid for this entity", { categoryId: "Invalid category" });
  }

  const fieldErrors: Record<string, string> = {};
  d.items.forEach((it, i) => {
    if (!entity.allowedCurrencies.includes(it.currency)) fieldErrors[`items.${i}.currency`] = `${it.currency} is not enabled for ${entity.code}`;
  });
  if (entity.currencyMode === "SINGLE") {
    const set = new Set(d.items.map((i) => i.currency));
    if (set.size > 1) throw invalid("All line items must use the same currency for this entity", { items: "Mixed currencies are not allowed" });
  }
  if (Object.keys(fieldErrors).length) throw invalid(Object.values(fieldErrors)[0]!, fieldErrors);
  return entity;
}

function computeTotals(items: ParsedDraft["items"]) {
  const t = totalsByCurrency(items);
  const currencies = Object.keys(t);
  return {
    currency: currencies.length === 1 ? currencies[0]! : currencies.length === 0 ? null : null,
    totalAmount: currencies.length === 1 ? new Prisma.Decimal(t[currencies[0]!]!) : currencies.length === 0 ? new Prisma.Decimal(0) : null,
  };
}

function summarize(pr: { title: string; comments: string; categoryId: string | null; currency: string | null; totalAmount: unknown; items?: { description: string; quantity: unknown; unitPrice: unknown; currency: string }[] }) {
  return {
    title: pr.title,
    categoryId: pr.categoryId,
    comments: pr.comments,
    currency: pr.currency,
    totalAmount: pr.totalAmount?.toString() ?? null,
    items: pr.items?.map((i) => ({ description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice), currency: i.currency })),
  };
}

/** Creates or updates a draft (or a returned PR). Totals are always recomputed here. */
export async function saveDraftTx(tx: Tx, actor: Actor, raw: DraftInput, requestId?: string) {
  const d = draftSchema.parse(raw);
  assertEntityAccess(actor, d.entityId);
  assertCan(actor, "pr.create", d.entityId);
  await validateAgainstEntity(tx, d);
  const totals = computeTotals(d.items);

  const itemsData = d.items.map((it, idx) => ({
    lineNo: idx + 1,
    description: it.description,
    specifications: it.specifications || null,
    quantity: new Prisma.Decimal(it.quantity),
    currency: it.currency,
    unitPrice: new Prisma.Decimal(it.unitPrice),
    lineTotal: new Prisma.Decimal(lineTotal(it.quantity, it.unitPrice).toFixed(2)),
  }));

  if (!requestId) {
    const pr = await tx.purchaseRequest.create({
      data: {
        entityId: d.entityId,
        title: d.title || "Untitled request",
        requesterId: actor.id,
        requesterName: actor.name,
        requesterJobTitle: actor.jobTitle,
        departmentId: actor.departmentId,
        departmentName: actor.departmentName,
        categoryId: d.categoryId ?? null,
        comments: d.comments,
        paymentDetails: d.paymentDetails || null,
        ...totals,
        items: { create: itemsData },
      },
      include: { items: true },
    });
    await audit(tx, {
      actor,
      action: "PR_CREATED",
      targetType: "PurchaseRequest",
      targetId: pr.id,
      entityId: pr.entityId,
      requestId: pr.id,
      summary: `Draft purchase request "${pr.title}" created`,
      after: summarize(pr),
    });
    return pr;
  }

  const existing = await tx.purchaseRequest.findUnique({ where: { id: requestId }, include: { items: true } });
  if (!existing) throw notFound();
  if (existing.requesterId !== actor.id) throw forbidden("Only the requestor can edit this purchase request");
  if (!(EDITABLE_STATUSES as readonly string[]).includes(existing.status))
    throw forbidden("This purchase request can no longer be edited");
  if (existing.entityId !== d.entityId) throw invalid("The entity of an existing request cannot be changed");

  await tx.purchaseRequestItem.deleteMany({ where: { requestId } });
  const pr = await tx.purchaseRequest.update({
    where: { id: requestId },
    data: {
      title: d.title || existing.title,
      categoryId: d.categoryId ?? null,
      comments: d.comments,
      paymentDetails: d.paymentDetails || null,
      // a draft's initiator section always reflects the current profile; it is frozen at submission
      ...(existing.status === "DRAFT"
        ? { requesterName: actor.name, requesterJobTitle: actor.jobTitle, departmentId: actor.departmentId, departmentName: actor.departmentName }
        : {}),
      ...totals,
      items: { create: itemsData },
    },
    include: { items: true },
  });
  await audit(tx, {
    actor,
    action: "PR_EDITED",
    targetType: "PurchaseRequest",
    targetId: pr.id,
    entityId: pr.entityId,
    requestId: pr.id,
    prNumber: pr.prNumber,
    summary: `Purchase request ${pr.prNumber ?? `"${pr.title}"`} edited`,
    before: summarize(existing),
    after: summarize(pr),
  });
  return pr;
}

/** Validates the stored request with the stricter submission rules. */
export function validateForSubmission(pr: {
  entityId: string;
  title: string;
  categoryId: string | null;
  comments: string;
  paymentDetails: string | null;
  items: { description: string; specifications: string | null; quantity: unknown; currency: string; unitPrice: unknown }[];
}) {
  try {
    submitSchema.parse({
      entityId: pr.entityId,
      title: pr.title === "Untitled request" ? "" : pr.title,
      categoryId: pr.categoryId,
      comments: pr.comments,
      paymentDetails: pr.paymentDetails ?? "",
      items: pr.items.map((i) => ({
        description: i.description,
        specifications: i.specifications ?? "",
        quantity: new Prisma.Decimal(String(i.quantity)).toString(),
        currency: i.currency,
        unitPrice: new Prisma.Decimal(String(i.unitPrice)).toFixed(2),
      })),
    });
  } catch (e) {
    if (e instanceof ZodError) {
      const fe: Record<string, string> = {};
      for (const i of e.issues) fe[i.path.join(".")] ??= i.message;
      throw invalid(Object.values(fe)[0] ?? "Request is incomplete", fe);
    }
    throw e;
  }
}

const detailInclude = {
  entity: true,
  category: { include: { level1Approver: { select: { id: true, name: true } } } },
  department: true,
  items: { orderBy: { lineNo: "asc" } },
  stages: {
    orderBy: { stageOrder: "asc" },
    include: { assignedUser: { select: { id: true, name: true, jobTitle: true } }, assignedRole: true },
  },
  approvals: { orderBy: { createdAt: "asc" } },
  comments_: { orderBy: { createdAt: "asc" } },
  attachments: { where: { removedAt: null }, orderBy: { createdAt: "asc" } },
  revisions: { orderBy: { revision: "asc" }, select: { id: true, revision: true, createdAt: true, snapshot: true } },
  requester: { select: { id: true, name: true, email: true, jobTitle: true } },
} satisfies Prisma.PurchaseRequestInclude;

export type RequestDetail = Prisma.PurchaseRequestGetPayload<{ include: typeof detailInclude }>;

/** Loads a request with row-level authorization applied. Returns capabilities for the UI. */
export async function getRequestForActor(db: DB, actor: Actor, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const pr = await db.purchaseRequest.findFirst({
    where: { AND: [{ id }, visibleRequestsWhere(actor)] },
    include: detailInclude,
  });
  if (!pr) throw notFound("Purchase request not found or you do not have access to it");

  const showPayment = canSeePaymentDetails(actor, pr);
  const activeStage = pr.stages.find((s) => s.state === "ACTIVE") ?? null;
  const isRequester = pr.requesterId === actor.id;
  const selfBlocked = isRequester && !pr.entity.allowSelfApproval;
  const isPending = (PENDING as readonly string[]).includes(pr.status);

  const caps = {
    canEdit: isRequester && (EDITABLE_STATUSES as readonly string[]).includes(pr.status),
    canSubmit: isRequester && (EDITABLE_STATUSES as readonly string[]).includes(pr.status),
    canCancel:
      !["APPROVED", "REJECTED", "CANCELLED"].includes(pr.status) && (isRequester || can(actor, "pr.cancel_any", pr.entityId)),
    canAct: Boolean(isPending && activeStage && !selfBlocked && isStageApprover(actor, pr.entityId, activeStage)),
    selfApprovalBlocked: Boolean(isPending && activeStage && selfBlocked && isStageApprover(actor, pr.entityId, activeStage)),
    canReassign: isPending && can(actor, "approval.reassign", pr.entityId),
    canComment: pr.status !== "DRAFT",
    canUpload: isRequester && (EDITABLE_STATUSES as readonly string[]).includes(pr.status),
    canViewAudit: can(actor, "audit.view", pr.entityId),
  };

  return { pr: { ...pr, paymentDetails: showPayment ? pr.paymentDetails : null }, paymentRestricted: !showPayment && !!pr.paymentDetails, activeStage, caps };
}

// ───────────────────────────── Listing / search ─────────────────────────────

export type RequestFilters = {
  q?: string;
  prNumber?: string;
  requester?: string;
  departmentId?: string;
  entityId?: string;
  categoryId?: string;
  status?: string;
  currency?: string;
  minAmount?: string;
  maxAmount?: string;
  from?: string;
  to?: string;
  mine?: boolean;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

const SORTABLE: Record<string, (dir: Prisma.SortOrder) => Prisma.PurchaseRequestOrderByWithRelationInput> = {
  prNumber: (dir) => ({ prNumber: { sort: dir, nulls: "last" } }),
  requester: (dir) => ({ requesterName: dir }),
  amount: (dir) => ({ totalAmount: { sort: dir, nulls: "last" } }),
  status: (dir) => ({ status: dir }),
  submitted: (dir) => ({ submittedAt: { sort: dir, nulls: "last" } }),
  updated: (dir) => ({ updatedAt: dir }),
};

const uuidOk = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
const decOk = (v?: string) => (v && /^\d+(\.\d+)?$/.test(v) ? new Prisma.Decimal(v) : undefined);
const dateOk = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00+01:00`) : undefined);

export function buildRequestWhere(actor: Actor, f: RequestFilters): Prisma.PurchaseRequestWhereInput {
  const and: Prisma.PurchaseRequestWhereInput[] = [visibleRequestsWhere(actor)];
  if (f.mine) and.push({ requesterId: actor.id });
  if (f.q?.trim()) {
    const q = f.q.trim().slice(0, 100);
    and.push({
      OR: [
        { prNumber: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { requesterName: { contains: q, mode: "insensitive" } },
        { comments: { contains: q, mode: "insensitive" } },
        { items: { some: { description: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  if (f.prNumber?.trim()) and.push({ prNumber: { contains: f.prNumber.trim(), mode: "insensitive" } });
  if (f.requester?.trim()) and.push({ requesterName: { contains: f.requester.trim(), mode: "insensitive" } });
  if (uuidOk(f.departmentId)) and.push({ departmentId: f.departmentId });
  if (uuidOk(f.entityId)) and.push({ entityId: f.entityId });
  if (uuidOk(f.categoryId)) and.push({ categoryId: f.categoryId });
  if (f.status) {
    const s = f.status.split(",").filter(Boolean);
    if (s.includes("PENDING")) s.push(...PENDING);
    and.push({ status: { in: s.filter((x) => x !== "PENDING") as Prisma.EnumPRStatusFilter["in"] } });
  }
  if (f.currency && /^[A-Z]{3}$/.test(f.currency)) and.push({ items: { some: { currency: f.currency } } });
  const min = decOk(f.minAmount);
  const max = decOk(f.maxAmount);
  if (min) and.push({ totalAmount: { gte: min } });
  if (max) and.push({ totalAmount: { lte: max } });
  const from = dateOk(f.from);
  const to = dateOk(f.to);
  if (from) and.push({ OR: [{ submittedAt: { gte: from } }, { submittedAt: null, createdAt: { gte: from } }] });
  if (to) {
    const end = new Date(to.getTime() + 86_400_000);
    and.push({ OR: [{ submittedAt: { lt: end } }, { submittedAt: null, createdAt: { lt: end } }] });
  }
  return { AND: and };
}

export async function listRequests(db: DB, actor: Actor, f: RequestFilters) {
  const pageSize = Math.min(Math.max(f.pageSize ?? 20, 5), 100);
  const page = Math.max(f.page ?? 1, 1);
  const where = buildRequestWhere(actor, f);
  const dir: Prisma.SortOrder = f.dir === "asc" ? "asc" : "desc";
  const orderBy = (SORTABLE[f.sort ?? ""] ?? SORTABLE.updated)(dir);

  const [total, rows] = await Promise.all([
    db.purchaseRequest.count({ where }),
    db.purchaseRequest.findMany({
      where,
      orderBy: [orderBy, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        entity: { select: { code: true, name: true } },
        category: { select: { name: true } },
        items: { select: { currency: true, quantity: true, unitPrice: true } },
        stages: {
          where: { state: "ACTIVE" },
          include: { assignedUser: { select: { name: true } }, assignedRole: { select: { name: true } } },
        },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    rows: rows.map((r) => ({
      id: r.id,
      prNumber: r.prNumber,
      title: r.title,
      requesterName: r.requesterName,
      departmentName: r.departmentName,
      entityCode: r.entity.code,
      categoryName: r.category?.name ?? null,
      totals: totalsByCurrency(r.items.map((i) => ({ currency: i.currency, quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString() }))),
      status: r.status,
      currentApprover: r.stages[0] ? (r.stages[0].assignedUser?.name ?? r.stages[0].assignedRole?.name ?? "—") : null,
      currentStage: r.stages[0]?.name ?? null,
      submittedAt: r.submittedAt,
      updatedAt: r.updatedAt,
    })),
  };
}

/** Options for forms: entities the actor may raise PRs in, with categories and currencies. */
export async function getFormOptions(db: DB, actor: Actor) {
  const entities = await db.entity.findMany({
    where: { id: { in: actor.entityIds }, isActive: true },
    include: { categories: { where: { isActive: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  return entities
    .filter((e) => can(actor, "pr.create", e.id))
    .map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      isConfigured: e.isConfigured,
      currencyMode: e.currencyMode,
      defaultCurrency: e.defaultCurrency,
      allowedCurrencies: e.allowedCurrencies,
      categories: e.categories.map((c) => ({ id: c.id, name: c.name, level1Label: c.level1Label })),
    }));
}
