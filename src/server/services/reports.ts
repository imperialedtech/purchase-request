import Decimal from "decimal.js";
import type { DB } from "../db";
import { type Actor, entitiesWith } from "../auth/actor";
import { forbidden } from "../errors";
import { buildRequestWhere, PENDING, type RequestFilters } from "./requests";
import { STATUS_LABEL, type PRStatusKey } from "@/lib/status";

export const REPORT_TYPES = {
  summary: "PR Summary Report",
  approved: "Approved PR Report",
  pending: "Pending PR Report",
  rejected: "Rejected PR Report",
  department: "PR by Department",
  category: "PR by Category",
  requester: "PR by Requestor",
  entity: "PR by Entity",
  monthly: "Monthly PR Report",
  financial: "Financial Summary",
  performance: "Approval Performance Report",
} as const;
export type ReportType = keyof typeof REPORT_TYPES;

export type ReportColumn = { key: string; label: string; align?: "right"; money?: boolean };
export type Report = { type: ReportType; title: string; columns: ReportColumn[]; rows: Record<string, string | number>[]; generatedAt: Date; note?: string };

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export async function runReport(db: DB, actor: Actor, type: ReportType, f: RequestFilters): Promise<Report> {
  const reportEntities = entitiesWith(actor, "report.view");
  if (reportEntities.length === 0) throw forbidden("You do not have access to reports");
  if (!(type in REPORT_TYPES)) type = "summary";

  const statusFilter = type === "approved" ? "APPROVED" : type === "pending" ? "PENDING" : type === "rejected" ? "REJECTED" : f.status;
  const where = {
    AND: [buildRequestWhere(actor, { ...f, status: statusFilter, mine: false }), { status: { not: "DRAFT" as const } }, { entityId: { in: reportEntities } }],
  };
  const currency = f.currency && /^[A-Z]{3}$/.test(f.currency) ? f.currency : undefined;

  const prs = await db.purchaseRequest.findMany({
    where,
    orderBy: { submittedAt: "desc" },
    take: 5000,
    include: {
      entity: { select: { code: true } },
      category: { select: { name: true } },
      items: { where: currency ? { currency } : undefined, select: { currency: true, lineTotal: true } },
      approvals: type === "performance" ? { orderBy: { createdAt: "asc" } } : false,
      revisions: type === "performance" ? { select: { revision: true, createdAt: true } } : false,
      stages: { where: { state: "ACTIVE" }, include: { assignedUser: { select: { name: true } }, assignedRole: { select: { name: true } } } },
    },
  });
  const base = { type, title: REPORT_TYPES[type], generatedAt: new Date() };

  // per-PR amount per currency
  const amounts = (p: (typeof prs)[number]) => {
    const m: Record<string, Decimal> = {};
    for (const i of p.items) m[i.currency] = (m[i.currency] ?? new Decimal(0)).add(i.lineTotal.toString());
    return m;
  };

  if (["summary", "approved", "pending", "rejected"].includes(type)) {
    const rows: Record<string, string | number>[] = [];
    for (const p of prs)
      for (const [cur, amt] of Object.entries(amounts(p)))
        rows.push({
          prNumber: p.prNumber ?? "",
          submitted: ymd(p.submittedAt),
          requester: p.requesterName,
          department: p.departmentName ?? "",
          entity: p.entity.code,
          category: p.category?.name ?? "",
          title: p.title,
          status: STATUS_LABEL[p.status as PRStatusKey],
          currentApprover: p.stages[0] ? (p.stages[0].assignedUser?.name ?? p.stages[0].assignedRole?.name ?? "") : "",
          currency: cur,
          amount: amt.toFixed(2),
          ...(type === "approved" ? { approvedOn: ymd(p.finalApprovedAt), approvedBy: p.finalApproverName ?? "" } : {}),
          ...(type === "rejected" ? { reason: p.rejectionReason ?? "" } : {}),
        });
    const cols: ReportColumn[] = [
      { key: "prNumber", label: "PR Number" },
      { key: "submitted", label: "Submitted" },
      { key: "requester", label: "Requestor" },
      { key: "department", label: "Department" },
      { key: "entity", label: "Entity" },
      { key: "category", label: "Category" },
      { key: "title", label: "Summary" },
      { key: "status", label: "Status" },
      ...(type === "pending" ? [{ key: "currentApprover", label: "Current approver" }] : []),
      ...(type === "approved" ? [{ key: "approvedOn", label: "Approved on" }, { key: "approvedBy", label: "Final approver" }] : []),
      ...(type === "rejected" ? [{ key: "reason", label: "Rejection reason" }] : []),
      { key: "currency", label: "Currency" },
      { key: "amount", label: "Amount", align: "right", money: true },
    ];
    return { ...base, columns: cols, rows, note: "PRs with line items in several currencies appear once per currency." };
  }

  if (["department", "category", "requester", "entity"].includes(type)) {
    const key = (p: (typeof prs)[number]) =>
      type === "department" ? (p.departmentName ?? "Unassigned") : type === "category" ? (p.category?.name ?? "Uncategorised") : type === "requester" ? p.requesterName : p.entity.code;
    const groups = new Map<string, { count: Set<string>; approved: Set<string>; total: Decimal; approvedTotal: Decimal; pendingTotal: Decimal }>();
    for (const p of prs)
      for (const [cur, amt] of Object.entries(amounts(p))) {
        const k = `${key(p)}\u0000${cur}`;
        const g = groups.get(k) ?? { count: new Set(), approved: new Set(), total: new Decimal(0), approvedTotal: new Decimal(0), pendingTotal: new Decimal(0) };
        g.count.add(p.id);
        g.total = g.total.add(amt);
        if (p.status === "APPROVED") {
          g.approved.add(p.id);
          g.approvedTotal = g.approvedTotal.add(amt);
        }
        if ((PENDING as readonly string[]).includes(p.status)) g.pendingTotal = g.pendingTotal.add(amt);
        groups.set(k, g);
      }
    const label = { department: "Department", category: "Category", requester: "Requestor", entity: "Entity" }[type as "department"];
    const rows = [...groups.entries()]
      .map(([k, g]) => {
        const [name, cur] = k.split("\u0000");
        return { name: name!, currency: cur!, count: g.count.size, approvedCount: g.approved.size, total: g.total.toFixed(2), approvedTotal: g.approvedTotal.toFixed(2), pendingTotal: g.pendingTotal.toFixed(2) };
      })
      .sort((a, b) => a.name.localeCompare(b.name) || a.currency.localeCompare(b.currency));
    return {
      ...base,
      columns: [
        { key: "name", label },
        { key: "currency", label: "Currency" },
        { key: "count", label: "PRs", align: "right" },
        { key: "approvedCount", label: "Approved", align: "right" },
        { key: "total", label: "Total requested", align: "right", money: true },
        { key: "approvedTotal", label: "Approved value", align: "right", money: true },
        { key: "pendingTotal", label: "Pending value", align: "right", money: true },
      ],
      rows,
    };
  }

  if (type === "monthly") {
    const groups = new Map<string, { submitted: Set<string>; approved: Set<string>; rejected: Set<string>; total: Decimal; approvedTotal: Decimal }>();
    for (const p of prs) {
      if (!p.submittedAt) continue;
      const month = p.submittedAt.toISOString().slice(0, 7);
      for (const [cur, amt] of Object.entries(amounts(p))) {
        const k = `${month}\u0000${cur}`;
        const g = groups.get(k) ?? { submitted: new Set(), approved: new Set(), rejected: new Set(), total: new Decimal(0), approvedTotal: new Decimal(0) };
        g.submitted.add(p.id);
        g.total = g.total.add(amt);
        if (p.status === "APPROVED") {
          g.approved.add(p.id);
          g.approvedTotal = g.approvedTotal.add(amt);
        }
        if (p.status === "REJECTED") g.rejected.add(p.id);
        groups.set(k, g);
      }
    }
    const rows = [...groups.entries()]
      .map(([k, g]) => {
        const [month, cur] = k.split("\u0000");
        return { month: month!, currency: cur!, submitted: g.submitted.size, approved: g.approved.size, rejected: g.rejected.size, total: g.total.toFixed(2), approvedTotal: g.approvedTotal.toFixed(2) };
      })
      .sort((a, b) => b.month.localeCompare(a.month) || a.currency.localeCompare(b.currency));
    return {
      ...base,
      columns: [
        { key: "month", label: "Month" },
        { key: "currency", label: "Currency" },
        { key: "submitted", label: "Submitted", align: "right" },
        { key: "approved", label: "Approved", align: "right" },
        { key: "rejected", label: "Rejected", align: "right" },
        { key: "total", label: "Total requested", align: "right", money: true },
        { key: "approvedTotal", label: "Approved value", align: "right", money: true },
      ],
      rows,
    };
  }

  if (type === "financial") {
    const g = new Map<string, Record<string, Decimal>>();
    const counts = new Map<string, Record<string, Set<string>>>();
    for (const p of prs) {
      const bucket = p.status === "APPROVED" ? "approved" : p.status === "REJECTED" ? "rejected" : p.status === "CANCELLED" ? "cancelled" : (PENDING as readonly string[]).includes(p.status) || p.status === "RETURNED" ? "pending" : "other";
      for (const [cur, amt] of Object.entries(amounts(p))) {
        const m = g.get(cur) ?? { requested: new Decimal(0), approved: new Decimal(0), pending: new Decimal(0), rejected: new Decimal(0), cancelled: new Decimal(0), other: new Decimal(0) };
        m.requested = m.requested!.add(amt);
        m[bucket] = m[bucket]!.add(amt);
        g.set(cur, m);
        const c = counts.get(cur) ?? { all: new Set() };
        c.all!.add(p.id);
        counts.set(cur, c);
      }
    }
    const rows = [...g.entries()].map(([cur, m]) => ({
      currency: cur,
      count: counts.get(cur)!.all!.size,
      requested: m.requested!.toFixed(2),
      approved: m.approved!.toFixed(2),
      pending: m.pending!.toFixed(2),
      rejected: m.rejected!.toFixed(2),
      cancelled: m.cancelled!.toFixed(2),
    }));
    return {
      ...base,
      columns: [
        { key: "currency", label: "Currency" },
        { key: "count", label: "PRs", align: "right" },
        { key: "requested", label: "Total requested", align: "right", money: true },
        { key: "approved", label: "Approved", align: "right", money: true },
        { key: "pending", label: "Pending / returned", align: "right", money: true },
        { key: "rejected", label: "Rejected", align: "right", money: true },
        { key: "cancelled", label: "Cancelled", align: "right", money: true },
      ],
      rows,
      note: "Totals are kept per currency. No currency conversion is applied.",
    };
  }

  // approval performance: decisions per approver & stage with average turnaround
  const perf = new Map<string, { approver: string; stage: string; approved: number; rejected: number; clarification: number; hours: number[] }>();
  for (const p of prs) {
    const approvals = (p.approvals ?? []) as { actorName: string; stageName: string; decision: string; createdAt: Date; revision: number }[];
    const revs = (p.revisions ?? []) as { revision: number; createdAt: Date }[];
    let prev: Date | null = null;
    let prevRev = -1;
    for (const a of approvals) {
      const start: Date | null = a.revision !== prevRev ? (revs.find((r) => r.revision === a.revision)?.createdAt ?? p.submittedAt) : prev;
      const k = `${a.actorName}\u0000${a.stageName}`;
      const g = perf.get(k) ?? { approver: a.actorName, stage: a.stageName, approved: 0, rejected: 0, clarification: 0, hours: [] };
      if (a.decision === "APPROVED") g.approved++;
      else if (a.decision === "REJECTED") g.rejected++;
      else g.clarification++;
      if (start) g.hours.push((a.createdAt.getTime() - start.getTime()) / 3_600_000);
      perf.set(k, g);
      prev = a.createdAt;
      prevRev = a.revision;
    }
  }
  const rows = [...perf.values()]
    .map((g) => ({
      approver: g.approver,
      stage: g.stage,
      decisions: g.approved + g.rejected + g.clarification,
      approved: g.approved,
      rejected: g.rejected,
      clarification: g.clarification,
      avgHours: g.hours.length ? (g.hours.reduce((a, b) => a + b, 0) / g.hours.length).toFixed(1) : "",
    }))
    .sort((a, b) => a.stage.localeCompare(b.stage) || a.approver.localeCompare(b.approver));
  return {
    ...base,
    columns: [
      { key: "approver", label: "Approver" },
      { key: "stage", label: "Stage" },
      { key: "decisions", label: "Decisions", align: "right" },
      { key: "approved", label: "Approved", align: "right" },
      { key: "rejected", label: "Rejected", align: "right" },
      { key: "clarification", label: "Clarifications", align: "right" },
      { key: "avgHours", label: "Avg. hours to decide", align: "right" },
    ],
    rows,
  };
}
