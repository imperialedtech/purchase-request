import Link from "next/link";
import { ClipboardCheck, Clock } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { awaitingMyApprovalWhere } from "@/server/services/visibility";
import { getSettings } from "@/server/services/admin";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { formatMoney, totalsByCurrency } from "@/lib/money";
import { DECISION_LABEL } from "@/lib/status";
import { fmtDateTime, requestTime } from "@/lib/utils";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const actor = await requireActor();
  const [queue, decided, settings] = await Promise.all([
    db.purchaseRequest.findMany({
      where: awaitingMyApprovalWhere(actor),
      orderBy: { lastSubmittedAt: "asc" },
      include: {
        entity: { select: { code: true } },
        category: { select: { name: true } },
        items: { select: { currency: true, quantity: true, unitPrice: true } },
        stages: { where: { state: "ACTIVE" } },
        _count: { select: { attachments: { where: { removedAt: null } } } },
      },
    }),
    db.purchaseRequestApproval.findMany({
      where: { actorId: actor.id },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { request: { select: { id: true, prNumber: true, title: true, status: true, requesterName: true } } },
    }),
    getSettings(db),
  ]);
  const overdueMs = settings.overdueHighlightHours * 3_600_000;
  const now = requestTime();

  return (
    <>
      <PageHeader title="Approvals" description="Purchase requests waiting for your decision, oldest first." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title={`Awaiting my approval (${queue.length})`} />
          {queue.length === 0 ? (
            <EmptyState icon={<ClipboardCheck className="h-10 w-10" />} title="You're all caught up" description="New requests that need your approval will appear here and in your notifications." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {queue.map((r) => {
                const stage = r.stages[0];
                const since = stage?.activatedAt ?? r.lastSubmittedAt;
                const overdue = since && now - since.getTime() > (stage?.escalationHours ? stage.escalationHours * 3_600_000 : overdueMs);
                const totals = totalsByCurrency(r.items.map((i) => ({ currency: i.currency, quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString() })));
                return (
                  <li key={r.id}>
                    <Link href={`/requests/${r.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-slate-50 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-brand-700">{r.prNumber}</span>
                          <StatusBadge status={r.status} />
                          {overdue && <Badge tone="red">Overdue</Badge>}
                          {r._count.attachments > 0 && <span className="text-xs text-slate-400">{r._count.attachments} attachment(s)</span>}
                        </div>
                        <p className="mt-1 truncate text-sm text-slate-800">{r.title}</p>
                        <p className="text-xs text-slate-500">
                          {r.requesterName} · {r.departmentName ?? "—"} · {r.category?.name ?? "—"}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        {Object.entries(totals).map(([c, v]) => (
                          <p key={c} className="text-sm font-semibold text-slate-900">
                            {formatMoney(v, c)}
                          </p>
                        ))}
                        <p className="flex items-center gap-1 text-xs text-slate-500 sm:justify-end">
                          <Clock className="h-3 w-3" /> {fmtDateTime(since)}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="My recent decisions" />
          {decided.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">No decisions yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {decided.map((d) => (
                <li key={d.id} className="px-5 py-3 text-sm">
                  <Link href={`/requests/${d.request.id}`} className="font-medium text-brand-700 hover:underline">
                    {d.request.prNumber}
                  </Link>
                  <span className="ml-2 text-xs text-slate-500">{DECISION_LABEL[d.decision]}</span>
                  <p className="truncate text-xs text-slate-500">
                    {d.request.title} · {fmtDateTime(d.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
