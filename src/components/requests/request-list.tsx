import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, FolderOpen, Filter } from "lucide-react";
import type { Actor } from "@/server/auth/actor";
import { db } from "@/server/db";
import { listRequests, type RequestFilters } from "@/server/services/requests";
import { Card, EmptyState, Input, LinkButton, Select, StatusBadge, Table, Td, Th, buttonClass } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { STATUS_LABEL, PR_STATUSES } from "@/lib/status";
import { fmtDate, fmtDateTime } from "@/lib/utils";

type SP = Record<string, string | undefined>;

export async function RequestList({ actor, sp, basePath, mine }: { actor: Actor; sp: SP; basePath: string; mine?: boolean }) {
  const filters: RequestFilters = {
    q: sp.q,
    requester: sp.requester,
    departmentId: sp.department,
    entityId: sp.entity,
    categoryId: sp.category,
    status: sp.status,
    currency: sp.currency,
    minAmount: sp.min,
    maxAmount: sp.max,
    from: sp.from,
    to: sp.to,
    sort: sp.sort,
    dir: sp.dir === "asc" ? "asc" : "desc",
    page: Number(sp.page) || 1,
    mine,
  };
  const [result, entities, departments, categories] = await Promise.all([
    listRequests(db, actor, filters),
    db.entity.findMany({ where: { id: { in: actor.entityIds } }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, allowedCurrencies: true } }),
    db.department.findMany({ where: { entityId: { in: actor.entityIds } }, orderBy: { name: "asc" }, select: { id: true, name: true, entity: { select: { code: true } } } }),
    db.category.findMany({ where: { entityId: { in: actor.entityIds } }, orderBy: { name: "asc" }, select: { id: true, name: true, entity: { select: { code: true } } } }),
  ]);
  const currencies = [...new Set(entities.flatMap((e) => e.allowedCurrencies))];
  const multiEntity = entities.length > 1;

  const qs = (patch: SP) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const sortLink = (key: string, label: string, right?: boolean) => {
    const active = (sp.sort ?? "updated") === key;
    const nextDir = active && filters.dir === "desc" ? "asc" : "desc";
    return (
      <Th className={right ? "text-right" : undefined}>
        <Link href={qs({ sort: key, dir: nextDir, page: undefined })} className="inline-flex items-center gap-1 hover:text-slate-800">
          {label}
          {active && (filters.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </Link>
      </Th>
    );
  };
  const activeFilters = ["q", "requester", "department", "entity", "category", "status", "currency", "min", "max", "from", "to"].filter((k) => sp[k]).length;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form method="get" action={basePath} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Input name="q" defaultValue={sp.q} placeholder="PR number, summary, requestor, item…" aria-label="Search" className="lg:col-span-2" />
          <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
            <option value="">All statuses</option>
            <option value="PENDING">Any pending stage</option>
            {PR_STATUSES.filter((s) => s !== "SUBMITTED" && s !== "PENDING_APPROVAL").map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {multiEntity ? ` (${c.entity.code})` : ""}
              </option>
            ))}
          </Select>
          <Select name="department" defaultValue={sp.department ?? ""} aria-label="Department">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {multiEntity ? ` (${d.entity.code})` : ""}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary", "md", "flex-1")}>
              <Filter className="h-4 w-4" /> Apply
            </button>
            {activeFilters > 0 && (
              <Link href={basePath} className={buttonClass("ghost")}>
                Clear
              </Link>
            )}
          </div>
          <details className="sm:col-span-2 lg:col-span-6" open={["requester", "entity", "currency", "min", "max", "from", "to"].some((k) => sp[k])}>
            <summary className="cursor-pointer text-xs font-medium text-slate-500 select-none">More filters</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {!mine && <Input name="requester" defaultValue={sp.requester} placeholder="Requestor name" aria-label="Requestor" />}
              {multiEntity && (
                <Select name="entity" defaultValue={sp.entity ?? ""} aria-label="Entity">
                  <option value="">All entities</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              )}
              <Select name="currency" defaultValue={sp.currency ?? ""} aria-label="Currency">
                <option value="">All currencies</option>
                {currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              <Input name="min" defaultValue={sp.min} placeholder="Min amount" inputMode="decimal" aria-label="Minimum amount" />
              <Input name="max" defaultValue={sp.max} placeholder="Max amount" inputMode="decimal" aria-label="Maximum amount" />
              <Input type="date" name="from" defaultValue={sp.from} aria-label="From date" />
              <Input type="date" name="to" defaultValue={sp.to} aria-label="To date" />
            </div>
          </details>
        </form>
      </Card>

      <Card>
        {result.rows.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="h-10 w-10" />}
            title={activeFilters ? "No requests match these filters" : mine ? "You have not created any purchase requests yet" : "No purchase requests to show"}
            description={activeFilters ? "Try removing a filter or widening the date range." : undefined}
            action={mine && !activeFilters ? <LinkButton href="/requests/new">Create a purchase request</LinkButton> : undefined}
          />
        ) : (
          <>
            {/* desktop table */}
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    {sortLink("prNumber", "PR number")}
                    {!mine && sortLink("requester", "Requestor")}
                    <Th>Summary</Th>
                    {sortLink("amount", "Amount", true)}
                    {sortLink("status", "Status")}
                    <Th>Current approver</Th>
                    {sortLink("submitted", "Submitted")}
                    {sortLink("updated", "Updated")}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.id} className="group hover:bg-slate-50/70">
                      <Td className="whitespace-nowrap">
                        <Link href={`/requests/${r.id}`} className="font-medium text-brand-700 hover:underline">
                          {r.prNumber ?? "Draft"}
                        </Link>
                        {multiEntity && <p className="text-[11px] text-slate-400">{r.entityCode}</p>}
                      </Td>
                      {!mine && (
                        <Td>
                          <p className="text-slate-900">{r.requesterName}</p>
                          <p className="text-xs text-slate-500">{r.departmentName ?? "—"}</p>
                        </Td>
                      )}
                      <Td className="max-w-xs">
                        <Link href={`/requests/${r.id}`} className="line-clamp-2 text-slate-800 hover:underline">
                          {r.title}
                        </Link>
                        <p className="text-xs text-slate-500">{r.categoryName ?? "—"}</p>
                      </Td>
                      <Td className="text-right font-medium whitespace-nowrap text-slate-900">
                        {Object.entries(r.totals).map(([c, v]) => (
                          <div key={c}>{formatMoney(v, c)}</div>
                        ))}
                        {Object.keys(r.totals).length === 0 && "—"}
                      </Td>
                      <Td>
                        <StatusBadge status={r.status} />
                      </Td>
                      <Td className="text-xs">{r.currentApprover ? <>{r.currentApprover}<p className="text-slate-400">{r.currentStage}</p></> : "—"}</Td>
                      <Td className="text-xs whitespace-nowrap">{fmtDate(r.submittedAt)}</Td>
                      <Td className="text-xs whitespace-nowrap">{fmtDateTime(r.updatedAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            {/* mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {result.rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/requests/${r.id}`} className="block px-4 py-3 active:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-brand-700">{r.prNumber ?? "Draft"}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-slate-800">{r.title}</p>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                      <span>{mine ? (r.categoryName ?? "") : r.requesterName}</span>
                      <span className="font-medium text-slate-900">{Object.entries(r.totals).map(([c, v]) => formatMoney(v, c)).join(" + ")}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <span>
                {(result.page - 1) * result.pageSize + 1}–{Math.min(result.page * result.pageSize, result.total)} of {result.total}
              </span>
              <div className="flex items-center gap-1">
                {result.page > 1 ? (
                  <Link href={qs({ page: String(result.page - 1) })} className={buttonClass("secondary", "sm")} aria-label="Previous page">
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                ) : null}
                <span className="px-2">
                  Page {result.page} of {result.pages}
                </span>
                {result.page < result.pages ? (
                  <Link href={qs({ page: String(result.page + 1) })} className={buttonClass("secondary", "sm")} aria-label="Next page">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
