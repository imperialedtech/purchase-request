import React from "react";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Report } from "../services/reports";
import { formatMoney } from "@/lib/money";
import { fmtDateTime } from "@/lib/utils";

Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: { padding: 28, paddingBottom: 40, fontFamily: "Helvetica", fontSize: 8, color: "#0f172a" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#0f1e3d" },
  sub: { fontSize: 8, color: "#64748b", marginTop: 3, marginBottom: 12 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  th: { padding: 4, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#334155", backgroundColor: "#f1f5f9" },
  td: { padding: 4 },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#64748b" },
});

export function ReportDocument({ report, filtersText, company, generatedBy }: { report: Report; filtersText: string; company: string; generatedBy: string }) {
  const w = `${100 / report.columns.length}%`;
  return (
    <Document title={report.title} creator="IPRAMS">
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>{report.title}</Text>
        <Text style={s.sub}>
          {company} · Generated {fmtDateTime(report.generatedAt)} by {generatedBy}
          {filtersText ? ` · Filters: ${filtersText}` : ""}
        </Text>
        <View style={s.tr} fixed>
          {report.columns.map((c) => (
            <Text key={c.key} style={[s.th, { width: w, textAlign: c.align === "right" ? "right" : "left" }]}>
              {c.label}
            </Text>
          ))}
        </View>
        {report.rows.length === 0 && <Text style={{ padding: 8, color: "#64748b" }}>No records match the selected filters.</Text>}
        {report.rows.map((r, i) => (
          <View key={i} style={s.tr} wrap={false}>
            {report.columns.map((c) => (
              <Text key={c.key} style={[s.td, { width: w, textAlign: c.align === "right" ? "right" : "left" }]}>
                {c.money ? formatMoney(String(r[c.key] ?? "0")) : String(r[c.key] ?? "")}
              </Text>
            ))}
          </View>
        ))}
        {report.note && <Text style={{ marginTop: 8, color: "#64748b" }}>{report.note}</Text>}
        <View style={s.footer} fixed>
          <Text>Confidential — internal use only</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
