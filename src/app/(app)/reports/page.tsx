import Link from "next/link";
import { Download, FileSpreadsheet, FileText, Filter } from "lucide-react";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { db } from "@/server/db";
import { REPORT_TYPES, runReport, type ReportType } from "@/server/services/reports";
import { reportFiltersFromParams } from "@/server/services/report-filters";
import { Alert, Card, CardHeader, EmptyState, Input, PageHeader, Select, Table, Td, Th, buttonClass } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { STATUS_LABEL, PR_STATUSES } from "@/lib/status";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor();
  if (!can(actor, "report.view")) redirect("/");
  const sp = await searchParams;
  const type = (sp.type && sp.type in REPORT_TYPES ? sp.type : "summary") as ReportType;
  const filters = reportFiltersFromParams(sp);
  const [report, entities, departments, categories] = await Promise.all([
    runReport(db, actor, type, filters),
    db.entity.findMany({ where: { id: { in: actor.entityIds } }, orderBy: { name: "asc" } }),
    db.department.findMany({ where: { entityId: { in: actor.entityIds } }, orderBy: { name: "asc" } }),
    db.category.findMany({ where: { entityId: { in: actor.entityIds } }, orderBy: { name: "asc" } }),
  ]);
  const currencies = [...new Set(entities.flatMap((e) => e.allowedCurrencies))];
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  qs.set("type", type);
  const canExport = can(actor, "report.export");

  // totals per currency for money columns (never summed across currencies)
  const moneyCols = report.columns.filter((c) => c.money);
  const currencyTotals: Record<string, Record<string, number>> = {};
  if (report.columns.some((c) => c.key === "currency"))
    for (const r of report.rows) {
      const cur = String(r.currency);
      currencyTotals[cur] ??= {};
      for (const c of moneyCols) currencyTotals[cur]![c.key] = (currencyTotals[cur]![c.key] ?? 0) + Number(r[c.key] ?? 0);
    }

  return (
    <>
      <PageHeader title="Reports" description="Live reports from purchase request records you are authorised to view." />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Report types">
          {(Object.keys(REPORT_TYPES) as ReportType[]).map((k) => {
            const p = new URLSearchParams(qs);
            p.set("type", k);
            return (
              <Link key={k} href={`/reports?${p}`} className={cn("shrink-0 rounded-md px-3 py-2 text-sm whitespace-nowrap", k === type ? "bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-white/70")}>
                {REPORT_TYPES[k]}
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0 space-y-4">
          <Card className="p-4">
            <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              <input type="hidden" name="type" value={type} />
              <Input type="date" name="from" defaultValue={sp.from} aria-label="From date" title="From" />
              <Input type="date" name="to" defaultValue={sp.to} aria-label="To date" title="To" />
              {entities.length > 1 && (
                <Select name="entity" defaultValue={sp.entity ?? ""} aria-label="Entity">
                  <option value="">All entities</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              )}
              <Select name="department" defaultValue={sp.department ?? ""} aria-label="Department">
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category">
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {!["approved", "pending", "rejected"].includes(type) && (
                <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
                  <option value="">All statuses</option>
                  <option value="PENDING">Any pending</option>
                  {PR_STATUSES.filter((s) => !["DRAFT", "SUBMITTED", "PENDING_APPROVAL"].includes(s)).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
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
              <Input name="requester" defaultValue={sp.requester} placeholder="Requestor" aria-label="Requestor" />
              <button className={buttonClass("primary")} type="submit">
                <Filter className="h-4 w-4" /> Apply
              </button>
            </form>
          </Card>

          <Card>
            <CardHeader
              title={report.title}
              description={`${report.rows.length} row(s)`}
              actions={
                canExport ? (
                  <>
                    <a className={buttonClass("secondary", "sm")} href={`/api/reports/export?${qs}&format=csv`}>
                      <Download className="h-3.5 w-3.5" /> CSV
                    </a>
                    <a className={buttonClass("secondary", "sm")} href={`/api/reports/export?${qs}&format=xlsx`}>
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                    </a>
                    <a className={buttonClass("secondary", "sm")} href={`/api/reports/export?${qs}&format=pdf`}>
                      <FileText className="h-3.5 w-3.5" /> PDF
                    </a>
                  </>
                ) : undefined
              }
            />
            {report.rows.length === 0 ? (
              <EmptyState title="No records match the selected filters" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    {report.columns.map((c) => (
                      <Th key={c.key} className={c.align === "right" ? "text-right" : undefined}>
                        {c.label}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      {report.columns.map((c) => (
                        <Td key={c.key} className={cn(c.align === "right" && "text-right whitespace-nowrap", c.key === "prNumber" && "font-medium whitespace-nowrap")}>
                          {c.money ? formatMoney(String(r[c.key] ?? "0")) : String(r[c.key] ?? "")}
                        </Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {moneyCols.length > 0 && Object.keys(currencyTotals).length > 0 && !["financial"].includes(type) && (
                  <tfoot>
                    {Object.entries(currencyTotals).map(([cur, t]) => (
                      <tr key={cur} className="bg-slate-50 font-semibold">
                        {report.columns.map((c, idx) => (
                          <td key={c.key} className={cn("px-4 py-2.5 text-sm", c.align === "right" && "text-right whitespace-nowrap")}>
                            {idx === 0 ? `Total (${cur})` : c.money ? formatMoney(String(t[c.key] ?? 0), cur) : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tfoot>
                )}
              </Table>
            )}
          </Card>
          {report.note && <Alert tone="blue">{report.note}</Alert>}
        </div>
      </div>
    </>
  );
}
