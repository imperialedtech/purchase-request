import Link from "next/link";
import { AlertCircle, Banknote, CheckCircle2, ClipboardCheck, FilePen, FileStack, Hourglass, XCircle, Bell, Plus } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { entitiesWith } from "@/server/auth/actor";
import { db } from "@/server/db";
import { getDashboard } from "@/server/services/dashboard";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { TrendChart } from "@/components/charts/trend-chart";
import { formatCompactMoney, formatMoney } from "@/lib/money";
import { DECISION_LABEL, STATUS_LABEL, STATUS_TONE, type PRStatusKey } from "@/lib/status";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

const barTone: Record<string, string> = { gray: "bg-slate-400", slate: "bg-slate-300", blue: "bg-blue-500", violet: "bg-violet-500", amber: "bg-amber-500", green: "bg-emerald-500", red: "bg-red-500", orange: "bg-orange-500" };

function MoneyLines({ m, empty = "—", compact }: { m: Record<string, string>; empty?: string; compact?: boolean }) {
  const e = Object.entries(m);
  if (!e.length) return <>{empty}</>;
  return (
    <>
      {e.map(([c, v]) => (
        <span key={c} className="block">{compact ? formatCompactMoney(v, c) : formatMoney(v, c)}</span>
      ))}
    </>
  );
}

function SpendBars({ rows }: { rows: { name: string; values: Record<string, string> }[] }) {
  const currencies = [...new Set(rows.flatMap((r) => Object.keys(r.values)))];
  if (!rows.length) return <p className="px-5 py-8 text-center text-sm text-slate-400">No approved spend in the last 12 months</p>;
  return (
    <div className="space-y-5 p-5">
      {currencies.map((cur) => {
        const list = rows.filter((r) => r.values[cur]).sort((a, b) => Number(b.values[cur]) - Number(a.values[cur])).slice(0, 6);
        const max = Math.max(...list.map((r) => Number(r.values[cur])));
        return (
          <div key={cur} className="space-y-2.5">
            {currencies.length > 1 && <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{cur}</p>}
            {list.map((r) => (
              <div key={r.name}>
                <div className="flex justify-between gap-2 text-xs">
                  <span className="truncate text-slate-700">{r.name}</span>
                  <span className="font-medium whitespace-nowrap text-slate-900">{formatMoney(r.values[cur], cur)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                  <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${Math.max(2, (Number(r.values[cur]) / max) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default async function DashboardPage() {
  const actor = await requireActor();
  const d = await getDashboard(db, actor);
  const isApprover = entitiesWith(actor, "approval.act").length > 0;
  const canCreate = entitiesWith(actor, "pr.create").length > 0;
  const multiEntity = actor.entityIds.length > 1;
  const totalStatus = d.statusBreakdown.reduce((a, b) => a + b.count, 0);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        title={`${greeting}, ${actor.name.split(" ")[0]}`}
        description={`${fmtDate(new Date())} · Overview of purchase requests you can access`}
        actions={
          canCreate ? (
            <LinkButton href="/requests/new">
              <Plus className="h-4 w-4" /> New request
            </LinkButton>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Total PRs" value={d.cards.total} icon={<FileStack className="h-4 w-4" />} href="/requests" />
        <Stat label="Drafts" value={d.cards.drafts} icon={<FilePen className="h-4 w-4" />} href="/my-requests?status=DRAFT" />
        <Stat label="Pending approval" value={d.cards.pending} icon={<Hourglass className="h-4 w-4" />} tone="blue" href="/requests?status=PENDING" />
        <Stat label="Returned" value={d.cards.returned} icon={<AlertCircle className="h-4 w-4" />} tone="orange" href="/requests?status=RETURNED" />
        <Stat label="Rejected" value={d.cards.rejected} icon={<XCircle className="h-4 w-4" />} tone="red" href="/requests?status=REJECTED" />
        <Stat label="Approved" value={d.cards.approved} icon={<CheckCircle2 className="h-4 w-4" />} tone="green" href="/requests?status=APPROVED" />
        <Stat label="Approved value" value={<span className="block text-base" title={Object.entries(d.cards.approvedValue).map(([c, v]) => formatMoney(v, c)).join(", ")}><MoneyLines m={d.cards.approvedValue} compact /></span>} icon={<Banknote className="h-4 w-4" />} tone="green" />
        <Stat label="Pending value" value={<span className="block text-base" title={Object.entries(d.cards.pendingValue).map(([c, v]) => formatMoney(v, c)).join(", ")}><MoneyLines m={d.cards.pendingValue} compact /></span>} icon={<Banknote className="h-4 w-4" />} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {isApprover && (
          <Card className="xl:col-span-2">
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-brand-600" /> Requests awaiting my approval
                  {d.cards.awaitingMe > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] text-white">{d.cards.awaitingMe}</span>}
                </span>
              }
              actions={<Link href="/approvals" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>}
            />
            {d.awaiting.length === 0 ? (
              <EmptyState title="Nothing waiting for you" description="You will be notified when a request needs your approval." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.awaiting.map((r) => (
                  <li key={r.id}>
                    <Link href={`/requests/${r.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          <span className="text-brand-700">{r.prNumber}</span> · {r.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {r.requesterName} · {r.stage} · since {fmtDateTime(r.since)}
                        </p>
                      </div>
                      <div className="text-right text-sm font-semibold whitespace-nowrap text-slate-900">
                        <MoneyLines m={r.totals} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card className={cn(!isApprover && "xl:col-span-2")}>
          <CardHeader title="Monthly PR trends" description="Requests submitted in the last 12 months" />
          <div className="p-4">
            <TrendChart data={d.months} />
          </div>
        </Card>

        <Card>
          <CardHeader title="PR status overview" />
          <div className="space-y-3 p-5">
            {totalStatus === 0 && <p className="py-6 text-center text-sm text-slate-400">No purchase requests yet</p>}
            {d.statusBreakdown
              .sort((a, b) => b.count - a.count)
              .map((s) => (
                <Link key={s.status} href={`/requests?status=${s.status}`} className="block">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700">{STATUS_LABEL[s.status as PRStatusKey]}</span>
                    <span className="font-medium text-slate-900">{s.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                    <div className={cn("h-1.5 rounded-full", barTone[STATUS_TONE[s.status as PRStatusKey]])} style={{ width: `${(s.count / totalStatus) * 100}%` }} />
                  </div>
                </Link>
              ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent purchase requests" actions={<Link href="/requests" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>} />
          {d.recent.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-400">No submitted requests yet</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/requests/${r.id}`} className="block px-5 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-brand-700">{r.prNumber}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {r.title} · {r.requesterName}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {canCreate && (
          <Card>
            <CardHeader title="My requests" actions={<Link href="/my-requests" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>} />
            {d.mine.length === 0 ? (
              <EmptyState title="No requests yet" action={<LinkButton href="/requests/new" size="sm">Create a request</LinkButton>} />
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.mine.map((r) => (
                  <li key={r.id}>
                    <Link href={`/requests/${r.id}`} className="block px-5 py-3 hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">{r.prNumber ?? r.title}</span>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="mt-0.5 flex justify-between text-xs text-slate-500">
                        <span className="truncate">{r.prNumber ? r.title : "Draft"}</span>
                        <span className="ml-2 whitespace-nowrap">
                          <MoneyLines m={r.totals} />
                        </span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card>
          <CardHeader title="Approval activity" />
          {d.activity.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-400">No approval decisions yet</p>
          ) : (
            <ul className="space-y-3 p-5">
              {d.activity.map((a) => (
                <li key={a.id} className="text-xs">
                  <p className="text-slate-800">
                    <span className="font-medium">{a.actorName}</span> {DECISION_LABEL[a.decision]?.toLowerCase()}{" "}
                    <Link href={`/requests/${a.requestId}`} className="font-medium text-brand-700 hover:underline">
                      {a.prNumber}
                    </Link>
                  </p>
                  <p className="text-slate-400">
                    {a.stageName} · {fmtDateTime(a.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Spending by department" description="Approved value, last 12 months" />
          <SpendBars rows={d.byDepartment} />
        </Card>
        <Card>
          <CardHeader title="Spending by category" description="Approved value, last 12 months" />
          <SpendBars rows={d.byCategory} />
        </Card>
        {multiEntity ? (
          <Card>
            <CardHeader title="Spending by entity" description="Approved value, last 12 months" />
            <SpendBars rows={d.byEntity} />
          </Card>
        ) : null}

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Bell className="h-4 w-4 text-slate-400" /> Recent notifications</span>} actions={<Link href="/notifications" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>} />
          {d.notifications.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-400">No notifications</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.notifications.map((n) => (
                <li key={n.id} className="px-5 py-2.5">
                  <Link href={n.link ?? "/notifications"} className="flex items-start gap-2 text-xs">
                    {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />}
                    <span className={cn("flex-1", n.readAt ? "text-slate-500" : "font-medium text-slate-900")}>{n.title}</span>
                    <span className="whitespace-nowrap text-slate-400">{fmtDate(n.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
