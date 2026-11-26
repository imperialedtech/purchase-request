import Decimal from "decimal.js";
import type { DB } from "../db";
import type { Actor } from "../auth/actor";
import { awaitingMyApprovalWhere, visibleRequestsWhere } from "./visibility";
import { PENDING } from "./requests";

type Money = Record<string, string>;
const add = (m: Record<string, Decimal>, c: string, v: Decimal.Value) => (m[c] = (m[c] ?? new Decimal(0)).add(v));
const fix = (m: Record<string, Decimal>): Money => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.toFixed(2)]));

/** All dashboard figures come from live records filtered through the actor's visibility rules. */
export async function getDashboard(db: DB, actor: Actor) {
  const visible = visibleRequestsWhere(actor);
  const since = new Date();
  since.setMonth(since.getMonth() - 11, 1);
  since.setHours(0, 0, 0, 0);

  const [byStatus, awaitingCount, awaiting, recent, mine, activity, notifications, valueItems, trendRows] = await Promise.all([
    db.purchaseRequest.groupBy({ by: ["status"], where: visible, _count: { _all: true } }),
    db.purchaseRequest.count({ where: awaitingMyApprovalWhere(actor) }),
    db.purchaseRequest.findMany({
      where: awaitingMyApprovalWhere(actor),
      orderBy: { lastSubmittedAt: "asc" },
      take: 6,
      include: { items: { select: { currency: true, lineTotal: true } }, stages: { where: { state: "ACTIVE" } } },
    }),
    db.purchaseRequest.findMany({
      where: { AND: [visible, { status: { not: "DRAFT" } }] },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { items: { select: { currency: true, lineTotal: true } } },
    }),
    db.purchaseRequest.findMany({
      where: { requesterId: actor.id, entityId: { in: actor.entityIds } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { items: { select: { currency: true, lineTotal: true } } },
    }),
    db.purchaseRequestApproval.findMany({
      where: { request: visible },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { request: { select: { id: true, prNumber: true, title: true } } },
    }),
    db.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.purchaseRequestItem.findMany({
      where: { request: { AND: [visible, { status: { in: ["APPROVED", ...PENDING] } }] } },
      select: {
        currency: true,
        lineTotal: true,
        request: {
          select: {
            status: true,
            finalApprovedAt: true,
            departmentName: true,
            category: { select: { name: true } },
            entity: { select: { code: true } },
          },
        },
      },
    }),
    db.purchaseRequest.findMany({
      where: { AND: [visible, { submittedAt: { gte: since } }] },
      select: { submittedAt: true, status: true },
    }),
  ]);

  const count = (s: string[]) => byStatus.filter((b) => s.includes(b.status)).reduce((a, b) => a + b._count._all, 0);
  const approvedValue: Record<string, Decimal> = {};
  const pendingValue: Record<string, Decimal> = {};
  const byDept: Record<string, Record<string, Decimal>> = {};
  const byCat: Record<string, Record<string, Decimal>> = {};
  const byEntity: Record<string, Record<string, Decimal>> = {};
  for (const it of valueItems) {
    if (it.request.status === "APPROVED") {
      add(approvedValue, it.currency, it.lineTotal.toString());
      if (it.request.finalApprovedAt && it.request.finalApprovedAt >= since) {
        add((byDept[it.request.departmentName ?? "Unassigned"] ??= {}), it.currency, it.lineTotal.toString());
        add((byCat[it.request.category?.name ?? "Uncategorised"] ??= {}), it.currency, it.lineTotal.toString());
        add((byEntity[it.request.entity.code] ??= {}), it.currency, it.lineTotal.toString());
      }
    } else add(pendingValue, it.currency, it.lineTotal.toString());
  }

  const months: { key: string; label: string; submitted: number; approved: number; rejected: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(since.getFullYear(), since.getMonth() + i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString("en-GB", { month: "short", year: "2-digit" }), submitted: 0, approved: 0, rejected: 0 });
  }
  for (const r of trendRows) {
    const d = r.submittedAt!;
    const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (!m) continue;
    m.submitted++;
    if (r.status === "APPROVED") m.approved++;
    if (r.status === "REJECTED") m.rejected++;
  }

  const dim = (m: Record<string, Record<string, Decimal>>) =>
    Object.entries(m)
      .map(([name, v]) => ({ name, values: fix(v) }))
      .sort((a, b) => Object.values(b.values).reduce((x, y) => x + Number(y), 0) - Object.values(a.values).reduce((x, y) => x + Number(y), 0));

  const sumItems = (items: { currency: string; lineTotal: { toString(): string } }[]) => {
    const t: Record<string, Decimal> = {};
    for (const i of items) add(t, i.currency, i.lineTotal.toString());
    return fix(t);
  };

  return {
    cards: {
      total: count(["SUBMITTED", ...PENDING, "RETURNED", "REJECTED", "APPROVED", "CANCELLED"]) + count(["DRAFT"]),
      drafts: count(["DRAFT"]),
      pending: count([...PENDING]),
      returned: count(["RETURNED"]),
      rejected: count(["REJECTED"]),
      approved: count(["APPROVED"]),
      awaitingMe: awaitingCount,
      approvedValue: fix(approvedValue),
      pendingValue: fix(pendingValue),
    },
    statusBreakdown: byStatus.map((b) => ({ status: b.status, count: b._count._all })),
    months,
    byDepartment: dim(byDept),
    byCategory: dim(byCat),
    byEntity: dim(byEntity),
    awaiting: awaiting.map((r) => ({ id: r.id, prNumber: r.prNumber, title: r.title, requesterName: r.requesterName, totals: sumItems(r.items), stage: r.stages[0]?.name ?? "", since: r.stages[0]?.activatedAt ?? r.lastSubmittedAt })),
    recent: recent.map((r) => ({ id: r.id, prNumber: r.prNumber, title: r.title, requesterName: r.requesterName, status: r.status, totals: sumItems(r.items), updatedAt: r.updatedAt })),
    mine: mine.map((r) => ({ id: r.id, prNumber: r.prNumber, title: r.title, status: r.status, totals: sumItems(r.items), updatedAt: r.updatedAt })),
    activity: activity.map((a) => ({ id: a.id, requestId: a.request.id, prNumber: a.request.prNumber, title: a.request.title, actorName: a.actorName, decision: a.decision, stageName: a.stageName, createdAt: a.createdAt })),
    notifications: notifications.map((n) => ({ id: n.id, title: n.title, link: n.link, readAt: n.readAt, createdAt: n.createdAt })),
  };
}
