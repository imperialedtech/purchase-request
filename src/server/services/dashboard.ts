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

  const [byStatus, awaitingCount, awaiting, recent, mine, activity, notifications, valueItems, trendRows, activeStages, stageApprovals] = await Promise.all([
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
      select: { submittedAt: true, status: true, finalApprovedAt: true },
    }),
    db.purchaseRequestStage.groupBy({
      by: ["stageOrder", "name"],
      where: { state: "ACTIVE", request: visible },
      _count: { _all: true },
      orderBy: { stageOrder: "asc" },
    }),
    db.purchaseRequestApproval.findMany({
      where: { request: visible, decision: "APPROVED", createdAt: { gte: since } },
      select: { stageOrder: true, stageName: true, createdAt: true, stage: { select: { activatedAt: true } } },
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

  // The currency most line items use is the one KPI cards and value charts are drawn in;
  // other currencies are never converted or added to it.
  const currencyCount: Record<string, number> = {};
  for (const it of valueItems) currencyCount[it.currency] = (currencyCount[it.currency] ?? 0) + 1;
  const primaryCurrency = Object.entries(currencyCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "NGN";

  const months: { key: string; label: string; submitted: number; approved: number; rejected: number; value: number; days: number[]; avgDays: number | null }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(since.getFullYear(), since.getMonth() + i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString("en-GB", { month: "short", year: "2-digit" }), submitted: 0, approved: 0, rejected: 0, value: 0, days: [], avgDays: null });
  }
  for (const r of trendRows) {
    const d = r.submittedAt!;
    const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (!m) continue;
    m.submitted++;
    if (r.status === "APPROVED") m.approved++;
    if (r.status === "REJECTED") m.rejected++;
  }
  const monthOf = (d: Date) => months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
  for (const r of trendRows) {
    if (r.status !== "APPROVED" || !r.finalApprovedAt || !r.submittedAt) continue;
    monthOf(r.finalApprovedAt)?.days.push((r.finalApprovedAt.getTime() - r.submittedAt.getTime()) / 86_400_000);
  }
  for (const it of valueItems) {
    if (it.request.status !== "APPROVED" || it.currency !== primaryCurrency || !it.request.finalApprovedAt) continue;
    const m = monthOf(it.request.finalApprovedAt);
    if (m) m.value += Number(it.lineTotal.toString());
  }
  for (const m of months) m.avgDays = m.days.length ? m.days.reduce((a, b) => a + b, 0) / m.days.length : null;

  const allDays = months.flatMap((m) => m.days);
  const decided = months.reduce((a, m) => a + m.approved + m.rejected, 0);
  const approvedInYear = months.reduce((a, m) => a + m.approved, 0);
  const [prev, cur] = months.slice(-2);
  const change = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : null) : ((a - b) / b) * 100);

  // per approval stage: requests waiting now, and how long approvals there took (hours)
  const stageMap = new Map<number, { order: number; name: string; waiting: number; hours: number[] }>();
  for (const s of activeStages) {
    const e = stageMap.get(s.stageOrder) ?? { order: s.stageOrder, name: s.name, waiting: 0, hours: [] };
    e.waiting += s._count._all;
    stageMap.set(s.stageOrder, e);
  }
  for (const a of stageApprovals) {
    const e = stageMap.get(a.stageOrder) ?? { order: a.stageOrder, name: a.stageName, waiting: 0, hours: [] };
    if (a.stage.activatedAt && a.createdAt >= a.stage.activatedAt) e.hours.push((a.createdAt.getTime() - a.stage.activatedAt.getTime()) / 3_600_000);
    stageMap.set(a.stageOrder, e);
  }
  const stages = [...stageMap.values()]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ order: s.order, name: s.name, waiting: s.waiting, avgHours: s.hours.length ? s.hours.reduce((x, y) => x + y, 0) / s.hours.length : null, decided: s.hours.length }));

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
    months: months.map((m) => ({ key: m.key, label: m.label, submitted: m.submitted, approved: m.approved, rejected: m.rejected, value: m.value, avgDays: m.avgDays })),
    primaryCurrency,
    kpis: {
      submittedThisMonth: cur.submitted,
      submittedChange: change(cur.submitted, prev.submitted),
      approvedThisMonth: cur.approved,
      approvedChange: change(cur.approved, prev.approved),
      valueThisMonth: cur.value,
      valueChange: change(cur.value, prev.value),
      avgDays: allDays.length ? allDays.reduce((a, b) => a + b, 0) / allDays.length : null,
      avgDaysThisMonth: cur.avgDays,
      avgDaysPrevMonth: prev.avgDays,
      approvalRate: decided ? (approvedInYear / decided) * 100 : null,
      decided,
    },
    stages,
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
