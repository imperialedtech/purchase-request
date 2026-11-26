import Link from "next/link";
import { AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Banknote, Bell, CheckCircle2, ClipboardCheck, Clock, FileStack, Hourglass, Plus, Send, Tag, Timer } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { entitiesWith } from "@/server/auth/actor";
import { db } from "@/server/db";
import { getDashboard } from "@/server/services/dashboard";
import { Card, CardHeader, EmptyState, LinkButton, StatusBadge } from "@/components/ui";
import { AreaTrend } from "@/components/charts/area-trend";
import { Sparkline } from "@/components/charts/sparkline";
import { StatusDonut, type DonutSlice } from "@/components/charts/status-donut";
import { APPROVED, SERIES, SUBMITTED } from "@/components/charts/palette";
import { formatCompactMoney, formatMoney } from "@/lib/money";
import { DECISION_LABEL } from "@/lib/status";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

function MoneyLines({ m, empty = "—", compact }: { m: Record<string, string>; empty?: string; compact?: boolean }) {
  const e = Object.entries(m);
  if (!e.length) return <>{empty}</>;
  return (
    <>
      {e.map(([c, v]) => (
        <span key={c} className="block">
          {compact ? formatCompactMoney(v, c) : formatMoney(v, c)}
        </span>
      ))}
    </>
  );
}

/** Month-on-month change pill. `goodWhenDown` flips the colour for measures like turnaround time. */
function Delta({ pct, goodWhenDown }: { pct: number | null; goodWhenDown?: boolean }) {
  if (pct === null) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">new</span>;
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.5;
  const good = flat ? null : goodWhenDown ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        good === null ? "bg-slate-100 text-slate-600 ring-slate-200" : good ? "bg-emerald-50 text-emerald-600 ring-emerald-200" : "bg-red-50 text-red-600 ring-red-200",
      )}
      title="Change vs last month"
    >
      {!flat && <Icon className="h-3 w-3" />}
      {flat ? "0%" : `${Math.abs(pct).toFixed(0)}%`}
    </span>
  );
}

function Kpi({ icon, label, value, sub, delta, spark, color, unit, href }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub: string; delta: React.ReactNode; spark: { label: string; v: number | null }[]; color: string; unit?: string; href?: string }) {
  const body = (
    <Card className={cn("flex h-full flex-col overflow-hidden", href && "transition hover:border-slate-300")}>
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset" style={{ background: `${color}1f`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}>
            {icon}
          </span>
          <span className="text-xs font-medium text-slate-600">{label}</span>
        </div>
        {delta}
      </div>
      <div className="px-4 pt-3">
        <div className="text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
        <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>
      </div>
      <div className="mt-auto pt-2">
        <Sparkline data={spark} color={color} unit={unit} />
      </div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function DashboardPage() {
  const actor = await requireActor();
  const d = await getDashboard(db, actor);
  const isApprover = entitiesWith(actor, "approval.act").length > 0;
  const canCreate = entitiesWith(actor, "pr.create").length > 0;
  const multiEntity = actor.entityIds.length > 1;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const cur = d.primaryCurrency;
  const k = d.kpis;
  const last6 = d.months.slice(-6);
  const compact = (n: number) => formatCompactMoney(n.toFixed(2), cur);

  const count = (s: string[]) => d.statusBreakdown.filter((b) => s.includes(b.status)).reduce((a, b) => a + b.count, 0);
  const slices: DonutSlice[] = [
    { key: "pending", label: "Pending approval", count: d.cards.pending, color: "#3b82f6", href: "/requests?status=PENDING" },
    { key: "approved", label: "Approved", count: d.cards.approved, color: APPROVED, href: "/requests?status=APPROVED" },
    { key: "returned", label: "Returned", count: d.cards.returned, color: "#d97706", href: "/requests?status=RETURNED" },
    { key: "rejected", label: "Rejected", count: d.cards.rejected, color: SUBMITTED, href: "/requests?status=REJECTED" },
    { key: "draft", label: "Draft", count: d.cards.drafts, color: "#8b5cf6", href: "/my-requests?status=DRAFT" },
    { key: "cancelled", label: "Cancelled", count: count(["CANCELLED"]), color: "#737373", href: "/requests?status=CANCELLED" },
  ];

  // top categories in the main currency: segmented bar + ranked list
  const cats = d.byCategory.filter((c) => c.values[cur]).map((c) => ({ name: c.name, v: Number(c.values[cur]) }));
  const catTotal = cats.reduce((a, c) => a + c.v, 0);
  const topCats = cats.slice(0, 5);
  const otherCats = cats.slice(5).reduce((a, c) => a + c.v, 0);
  const catRows = otherCats > 0 ? [...topCats, { name: "Other", v: otherCats }] : topCats;

  const maxWaiting = Math.max(1, ...d.stages.map((s) => s.waiting));
  const hours = (h: number | null) => (h === null ? "—" : h < 1 ? "< 1 h" : h < 48 ? `${h.toFixed(0)} h` : `${(h / 24).toFixed(1)} days`);

  return (
    <div className="relative">
      {/* soft red glow behind the top of the page */}
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-80 w-[70%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(220,38,38,0.18),transparent)] blur-2xl" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* hero */}
        <Card className="relative overflow-hidden md:col-span-2 xl:row-span-2">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
          <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(239,68,68,0.35),transparent)]" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-start justify-between gap-4 p-6">
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{fmtDate(new Date())}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                  {greeting}, {actor.name.split(" ")[0]}
                </h1>
                <p className="mt-1.5 text-sm text-slate-600">
                  {isApprover && d.cards.awaitingMe > 0 ? (
                    <>
                      <span className="font-semibold text-slate-900">{d.cards.awaitingMe}</span> request{d.cards.awaitingMe === 1 ? "" : "s"} waiting for your approval
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-slate-900">{d.cards.pending}</span> request{d.cards.pending === 1 ? "" : "s"} moving through approval
                    </>
                  )}
                </p>
              </div>
              <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-[0_10px_40px_-8px_rgba(220,38,38,0.7)] sm:flex">
                <ClipboardCheck className="h-8 w-8" />
              </div>
            </div>

            <div className="px-6">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-700">Approval rate · last 12 months</span>
                <span className="text-slate-500">{k.approvalRate === null ? "No decisions yet" : `${k.approvalRate.toFixed(0)}% of ${k.decided} decided`}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-gradient-to-r from-brand-600 to-[#f87171]" style={{ width: `${k.approvalRate ?? 0}%` }} />
              </div>
            </div>

            <div className="mx-6 mt-5 grid grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-canvas/40">
              {[
                { label: "Total requests", value: d.cards.total, href: "/requests" },
                { label: "Pending", value: d.cards.pending, href: "/requests?status=PENDING" },
                { label: "Approved", value: d.cards.approved, href: "/requests?status=APPROVED" },
              ].map((s) => (
                <Link key={s.label} href={s.href} className="px-4 py-3 hover:bg-slate-50">
                  <p className="text-lg font-semibold text-slate-900">{s.value}</p>
                  <p className="text-[11px] text-slate-500">{s.label}</p>
                </Link>
              ))}
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-200 px-6 py-4">
              {canCreate && (
                <LinkButton href="/requests/new" size="sm">
                  <Plus className="h-4 w-4" /> New request
                </LinkButton>
              )}
              {isApprover && (
                <LinkButton href="/approvals" size="sm" variant="secondary">
                  Review approvals <ArrowRight className="h-3.5 w-3.5" />
                </LinkButton>
              )}
              {d.cards.returned > 0 && (
                <Link href="/requests?status=RETURNED" className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-600 ring-1 ring-amber-200 ring-inset">
                  <AlertCircle className="h-3.5 w-3.5" /> {d.cards.returned} returned for clarification
                </Link>
              )}
              <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5" /> Live figures
              </span>
            </div>
          </div>
        </Card>

        <Kpi
          icon={<Send className="h-4 w-4" />}
          label="Submitted this month"
          value={k.submittedThisMonth}
          sub="New purchase requests"
          delta={<Delta pct={k.submittedChange} />}
          spark={last6.map((m) => ({ label: m.label, v: m.submitted }))}
          color={SUBMITTED}
          unit="submitted"
          href="/requests"
        />
        <Kpi
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Approved this month"
          value={k.approvedThisMonth}
          sub="Fully approved requests"
          delta={<Delta pct={k.approvedChange} />}
          spark={last6.map((m) => ({ label: m.label, v: m.approved }))}
          color={APPROVED}
          unit="approved"
          href="/requests?status=APPROVED"
        />
        <Kpi
          icon={<Banknote className="h-4 w-4" />}
          label="Approved value"
          value={compact(k.valueThisMonth)}
          sub={`This month · ${cur}`}
          delta={<Delta pct={k.valueChange} />}
          spark={last6.map((m) => ({ label: m.label, v: m.value }))}
          color="#d97706"
          unit={cur}
        />
        <Kpi
          icon={<Timer className="h-4 w-4" />}
          label="Avg. approval time"
          value={k.avgDays === null ? "—" : hours(k.avgDays * 24)}
          sub="Submission to final approval · 12 months"
          delta={<Delta pct={k.avgDaysThisMonth !== null && k.avgDaysPrevMonth ? ((k.avgDaysThisMonth - k.avgDaysPrevMonth) / k.avgDaysPrevMonth) * 100 : k.avgDaysThisMonth === null ? 0 : null} goodWhenDown />}
          spark={last6.map((m) => ({ label: m.label, v: m.avgDays === null ? null : Number(m.avgDays.toFixed(1)) }))}
          color="#3b82f6"
          unit="days"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Request overview" description="Volume and approved value over time" />
          <AreaTrend data={d.months} currency={cur} />
        </Card>

        <Card>
          <CardHeader title="Top categories" description={`Approved spend, last 12 months · ${cur}`} />
          {catRows.length === 0 ? (
            <EmptyState icon={<Tag className="h-6 w-6" />} title="No approved spend yet" description="Categories appear here once requests are fully approved." />
          ) : (
            <div className="p-5">
              <p className="text-2xl font-semibold tracking-tight text-slate-900">{formatMoney(catTotal.toFixed(2), cur)}</p>
              <p className="text-xs text-slate-500">across {cats.length} categor{cats.length === 1 ? "y" : "ies"}</p>
              <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Share of approved spend by category">
                {catRows.map((c, i) => (
                  <div key={c.name} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(c.v / catTotal) * 100}%`, background: c.name === "Other" ? "#525252" : SERIES[i] }} title={`${c.name}: ${formatMoney(c.v.toFixed(2), cur)}`} />
                ))}
              </div>
              <ul className="mt-5 space-y-3.5">
                {catRows.map((c, i) => {
                  const color = c.name === "Other" ? "#737373" : SERIES[i];
                  return (
                    <li key={c.name} className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}1f`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}>
                        <Tag className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{c.name}</p>
                        <p className="text-[11px] text-slate-500">{((c.v / catTotal) * 100).toFixed(0)}% of spend</p>
                      </div>
                      <span className="text-sm font-semibold whitespace-nowrap text-slate-900">{compact(c.v)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Status breakdown" description="All requests you can see" />
          <StatusDonut slices={slices} />
        </Card>

        <Card>
          <CardHeader title="Approval pipeline" description="Waiting at each stage now, and typical time to approve" />
          {d.stages.length === 0 ? (
            <EmptyState icon={<Hourglass className="h-6 w-6" />} title="Nothing in the pipeline" description="Submitted requests show here by approval stage." />
          ) : (
            <ol className="space-y-4 p-5">
              {d.stages.map((s) => (
                <li key={s.order}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 ring-inset">{s.order}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">{s.name}</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {s.waiting} <span className="text-[11px] font-normal text-slate-500">waiting</span>
                        </p>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                        <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${s.waiting ? Math.max(4, (s.waiting / maxWaiting) * 100) : 0}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Avg. time to approve: <span className="text-slate-700">{hours(s.avgHours)}</span>
                        {s.decided > 0 && ` · ${s.decided} approval${s.decided === 1 ? "" : "s"} in 12 months`}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {isApprover ? (
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-brand-500" /> Awaiting my approval
                  {d.cards.awaitingMe > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] text-white">{d.cards.awaitingMe}</span>}
                </span>
              }
              actions={
                <Link href="/approvals" className="text-xs font-medium text-brand-700 hover:underline">
                  View all
                </Link>
              }
            />
            {d.awaiting.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="You're all caught up" description="You will be notified when a request needs your approval." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.awaiting.map((r) => (
                  <li key={r.id}>
                    <Link href={`/requests/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          <span className="text-brand-700">{r.prNumber}</span> · {r.title}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {r.requesterName} · {r.stage} · {fmtDateTime(r.since)}
                        </p>
                      </div>
                      <div className="text-right text-xs font-semibold whitespace-nowrap text-slate-900">
                        <MoneyLines m={r.totals} compact />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Card>
            <CardHeader title="Recent notifications" actions={<Link href="/notifications" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>} />
            <NotificationList items={d.notifications} />
          </Card>
        )}

        <Card>
          <CardHeader title="Recent purchase requests" actions={<Link href="/requests" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>} />
          {d.recent.length === 0 ? (
            <EmptyState icon={<FileStack className="h-6 w-6" />} title="No submitted requests yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/requests/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
                      {r.requesterName
                        .split(" ")
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        <span className="text-brand-700">{r.prNumber}</span> · {r.title}
                      </p>
                      <p className="truncate text-xs text-slate-500">{r.requesterName}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Spending by department" description={`Approved, last 12 months · ${cur}`} />
          <DeptBars rows={d.byDepartment} currency={cur} />
        </Card>

        <Card>
          <CardHeader title="Approval activity" />
          {d.activity.length === 0 ? (
            <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="No approval decisions yet" />
          ) : (
            <ol className="relative space-y-4 p-5 before:absolute before:top-6 before:bottom-6 before:left-[29px] before:w-px before:bg-slate-200">
              {d.activity.map((a) => (
                <li key={a.id} className="relative flex gap-3 text-xs">
                  <span
                    className={cn(
                      "relative z-10 mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-surface",
                      a.decision === "APPROVED" ? "bg-emerald-500" : a.decision === "REJECTED" ? "bg-red-500" : "bg-amber-500",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-slate-800">
                      <span className="font-medium">{a.actorName}</span> {DECISION_LABEL[a.decision]?.toLowerCase()}{" "}
                      <Link href={`/requests/${a.requestId}`} className="font-medium text-brand-700 hover:underline">
                        {a.prNumber}
                      </Link>
                    </p>
                    <p className="text-slate-500">
                      {a.stageName} · {fmtDateTime(a.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
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
                          <MoneyLines m={r.totals} compact />
                        </span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {multiEntity && (
          <Card>
            <CardHeader title="Spending by entity" description={`Approved, last 12 months · ${cur}`} />
            <DeptBars rows={d.byEntity} currency={cur} />
          </Card>
        )}

        {isApprover && (
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-slate-500" /> Recent notifications
                </span>
              }
              actions={<Link href="/notifications" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>}
            />
            <NotificationList items={d.notifications} />
          </Card>
        )}
      </div>
    </div>
  );
}

function DeptBars({ rows, currency }: { rows: { name: string; values: Record<string, string> }[]; currency: string }) {
  const list = rows
    .filter((r) => r.values[currency])
    .map((r) => ({ name: r.name, v: Number(r.values[currency]) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 6);
  if (!list.length) return <EmptyState icon={<Banknote className="h-6 w-6" />} title="No approved spend yet" />;
  const max = list[0].v;
  return (
    <ul className="space-y-3.5 p-5">
      {list.map((r) => (
        <li key={r.name}>
          <div className="flex justify-between gap-2 text-xs">
            <span className="truncate text-slate-700">{r.name}</span>
            <span className="font-medium whitespace-nowrap text-slate-900">{formatCompactMoney(r.v.toFixed(2), currency)}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-gradient-to-r from-brand-600 to-[#f87171]" style={{ width: `${Math.max(3, (r.v / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function NotificationList({ items }: { items: { id: string; title: string; link: string | null; readAt: Date | null; createdAt: Date }[] }) {
  if (items.length === 0) return <EmptyState icon={<Bell className="h-6 w-6" />} title="No notifications" />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((n) => (
        <li key={n.id} className="px-5 py-2.5">
          <Link href={n.link ?? "/notifications"} className="flex items-start gap-2 text-xs">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-600")} />
            <span className={cn("flex-1", n.readAt ? "text-slate-500" : "font-medium text-slate-900")}>{n.title}</span>
            <span className="whitespace-nowrap text-slate-500">{fmtDate(n.createdAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
