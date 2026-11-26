import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/server/db";
import { getActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { REPORT_TYPES, runReport, type ReportType } from "@/server/services/reports";
import { getSettings } from "@/server/services/admin";
import { audit } from "@/server/services/audit";
import { contentDisposition, errorResponse } from "@/server/http";
import { ReportDocument } from "@/server/pdf/report-document";
import { reportFiltersFromParams, describeFilters } from "@/server/services/report-filters";

export const runtime = "nodejs";

const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  // neutralise spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!can(actor, "report.export")) return NextResponse.json({ error: "You are not permitted to export reports" }, { status: 403 });
  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format") ?? "csv";
    const type = (url.searchParams.get("type") ?? "summary") as ReportType;
    if (!(type in REPORT_TYPES)) return NextResponse.json({ error: "Unknown report" }, { status: 400 });
    const filters = reportFiltersFromParams(url.searchParams);
    const report = await runReport(db, actor, type, filters);
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `${type}-report-${stamp}`;
    await audit(db, { actor, action: "REPORT_EXPORTED", targetType: "Report", targetId: type, summary: `${report.title} exported as ${format.toUpperCase()} (${report.rows.length} rows)`, metadata: { filters } });

    if (format === "csv") {
      const lines = [report.columns.map((c) => csvCell(c.label)).join(","), ...report.rows.map((r) => report.columns.map((c) => csvCell(r[c.key])).join(","))];
      return new NextResponse("﻿" + lines.join("\r\n"), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": contentDisposition("attachment", `${base}.csv`), "Cache-Control": "private, no-store" },
      });
    }
    if (format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      wb.creator = "IPRAMS";
      const ws = wb.addWorksheet(report.title.slice(0, 31));
      ws.columns = report.columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, c.label.length + 4), style: c.money ? { numFmt: "#,##0.00" } : {} }));
      for (const r of report.rows) ws.addRow(Object.fromEntries(report.columns.map((c) => [c.key, c.money ? Number(r[c.key]) : r[c.key]])));
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: "frozen", ySplit: 1 }];
      const buf = await wb.xlsx.writeBuffer();
      return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": contentDisposition("attachment", `${base}.xlsx`),
          "Cache-Control": "private, no-store",
        },
      });
    }
    if (format === "pdf") {
      const settings = await getSettings(db);
      const buf = await renderToBuffer(ReportDocument({ report, filtersText: await describeFilters(db, filters), company: settings.companyName, generatedBy: actor.name }));
      return new NextResponse(new Uint8Array(buf), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": contentDisposition("attachment", `${base}.pdf`), "Cache-Control": "private, no-store" },
      });
    }
    return NextResponse.json({ error: "Unknown format" }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
