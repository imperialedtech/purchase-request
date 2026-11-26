import React from "react";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// keep words intact (no automatic hyphenation)
Font.registerHyphenationCallback((word) => [word]);
import { formatMoney } from "@/lib/money";
import { DECISION_LABEL, STATUS_LABEL, type PRStatusKey } from "@/lib/status";
import { fmtDate, fmtDateTime } from "@/lib/utils";

const NAVY = "#0f1e3d";
const MUTED = "#64748b";
const BORDER = "#cbd5e1";

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 48, paddingHorizontal: 0, fontFamily: "Helvetica", fontSize: 9, color: "#0f172a" },
  header: { backgroundColor: NAVY, paddingVertical: 18, paddingHorizontal: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { color: "#fff", fontSize: 15, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, textAlign: "right" },
  headerSub: { color: "#cbd5e1", fontSize: 9, textAlign: "right", marginTop: 3 },
  body: { paddingHorizontal: 36, paddingTop: 16 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12, fontSize: 8.5, color: MUTED },
  section: { marginBottom: 14 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: NAVY, backgroundColor: "#eef2f9", paddingVertical: 5, paddingHorizontal: 8, borderLeftWidth: 3, borderLeftColor: NAVY, marginBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 0.75, borderLeftWidth: 0.75, borderColor: BORDER },
  cell: { width: "50%", borderRightWidth: 0.75, borderBottomWidth: 0.75, borderColor: BORDER, padding: 6 },
  label: { fontSize: 7.5, color: MUTED, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.4 },
  value: { fontSize: 9.5 },
  bold: { fontFamily: "Helvetica-Bold" },
  para: { borderWidth: 0.75, borderColor: BORDER, padding: 8, lineHeight: 1.45, minHeight: 40 },
  table: { borderTopWidth: 0.75, borderLeftWidth: 0.75, borderColor: BORDER },
  tr: { flexDirection: "row" },
  th: { backgroundColor: "#f1f5f9", fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#334155", padding: 5, borderRightWidth: 0.75, borderBottomWidth: 0.75, borderColor: BORDER },
  td: { padding: 5, borderRightWidth: 0.75, borderBottomWidth: 0.75, borderColor: BORDER, fontSize: 8.5 },
  right: { textAlign: "right" },
  footer: { position: "absolute", bottom: 18, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: MUTED, borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 6 },
  note: { fontSize: 7.5, color: MUTED, marginTop: 6, lineHeight: 1.4 },
});

export type PrPdfData = {
  entityName: string;
  entityCode: string;
  logo: { data: Buffer; format: "png" | "jpg" } | null;
  logoOnDark: boolean;
  footerText: string | null;
  prNumber: string;
  status: string;
  title: string;
  category: string | null;
  requesterName: string;
  requesterJobTitle: string | null;
  departmentName: string | null;
  submittedAt: Date | null;
  confirmedAt: Date | null;
  comments: string;
  showComments: boolean;
  items: { lineNo: number; description: string; specifications: string | null; quantity: string; currency: string; unitPrice: string; lineTotal: string }[];
  totals: Record<string, string>;
  stages: { order: number; name: string; assignee: string; state: string; record: { actorName: string; actorRole: string; decision: string; comment: string | null; at: Date } | null }[];
  history: { stageName: string; actorName: string; decision: string; comment: string | null; at: Date; revision: number }[];
  finalApprovedAt: Date | null;
  generatedAt: Date;
  generatedBy: string;
};

function Cell({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <View style={[s.cell, full ? { width: "100%" } : {}]}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

export function PrDocument(d: PrPdfData) {
  const statusLabel = STATUS_LABEL[d.status as PRStatusKey] ?? d.status;
  const cols = [
    { w: "6%", label: "#" },
    { w: "40%", label: "Description" },
    { w: "9%", label: "Quantity", right: true },
    { w: "9%", label: "Currency" },
    { w: "18%", label: "Unit Price (VAT Incl.)", right: true },
    { w: "18%", label: "Total Price (VAT Incl.)", right: true },
  ];
  return (
    <Document title={`${d.prNumber} — Purchase Request`} author={d.entityName} subject="Purchase Request" creator="IPRAMS">
      <Page size="A4" style={s.page}>
        <View style={[s.header, d.logoOnDark ? {} : { backgroundColor: "#ffffff", borderBottomWidth: 2, borderBottomColor: NAVY }]} fixed>
          <View>
            {d.logo ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={d.logo} style={{ height: 30, maxWidth: 190, objectFit: "contain" }} />
            ) : (
              <Text style={{ color: d.logoOnDark ? "#fff" : NAVY, fontSize: 16, fontFamily: "Helvetica-Bold" }}>{d.entityName}</Text>
            )}
            {d.logo && <Text style={{ color: d.logoOnDark ? "#cbd5e1" : MUTED, fontSize: 8, marginTop: 4 }}>{d.entityName}</Text>}
          </View>
          <View>
            <Text style={[s.headerTitle, d.logoOnDark ? {} : { color: NAVY }]}>PURCHASE REQUEST</Text>
            <Text style={[s.headerSub, d.logoOnDark ? {} : { color: MUTED }]}>{d.prNumber}</Text>
          </View>
        </View>

        <View style={s.body}>
          <View style={s.statusRow}>
            <Text>
              Status: <Text style={[s.bold, { color: d.status === "APPROVED" ? "#047857" : d.status === "REJECTED" ? "#b91c1c" : "#0f172a" }]}>{statusLabel.toUpperCase()}</Text>
              {d.finalApprovedAt ? `  ·  Fully approved ${fmtDateTime(d.finalApprovedAt)}` : ""}
            </Text>
            <Text>Category: {d.category ?? "—"}</Text>
          </View>

          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>SECTION 1 — INITIATOR</Text>
            <View style={s.grid}>
              <Cell label="Requestor name" value={d.requesterName} />
              <Cell label="Job title" value={d.requesterJobTitle ?? "—"} />
              <Cell label="Department" value={d.departmentName ?? "—"} />
              <Cell label="Request date" value={fmtDate(d.submittedAt)} />
              <Cell full label="Signature / confirmation" value={d.confirmedAt ? `Digitally confirmed by ${d.requesterName} (authenticated user) on ${fmtDateTime(d.confirmedAt)}` : "Not yet confirmed"} />
              <Cell full label="Request summary" value={d.title} />
            </View>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>SECTION 2 — COMMENTS</Text>
            <Text style={s.para}>{d.showComments ? d.comments || "—" : "—"}</Text>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>SECTION 3 — DESCRIPTION OF PURCHASE</Text>
            <View style={s.table}>
              <View style={s.tr} fixed>
                {cols.map((c) => (
                  <Text key={c.label} style={[s.th, { width: c.w }, c.right ? s.right : {}]}>
                    {c.label}
                  </Text>
                ))}
              </View>
              {d.items.map((i) => (
                <View key={i.lineNo} style={s.tr} wrap={false}>
                  <Text style={[s.td, { width: cols[0]!.w }]}>{i.lineNo}</Text>
                  <View style={[s.td, { width: cols[1]!.w }]}>
                    <Text>{i.description}</Text>
                    {i.specifications ? <Text style={{ color: MUTED, fontSize: 7.5, marginTop: 2 }}>{i.specifications}</Text> : null}
                  </View>
                  <Text style={[s.td, s.right, { width: cols[2]!.w }]}>{i.quantity}</Text>
                  <Text style={[s.td, { width: cols[3]!.w }]}>{i.currency}</Text>
                  <Text style={[s.td, s.right, { width: cols[4]!.w }]}>{formatMoney(i.unitPrice)}</Text>
                  <Text style={[s.td, s.right, { width: cols[5]!.w }]}>{formatMoney(i.lineTotal)}</Text>
                </View>
              ))}
              {Object.entries(d.totals).map(([c, v]) => (
                <View key={c} style={s.tr} wrap={false}>
                  <Text style={[s.td, s.bold, s.right, { width: "82%", backgroundColor: "#f8fafc" }]}>GRAND TOTAL ({c}, VAT inclusive)</Text>
                  <Text style={[s.td, s.bold, s.right, { width: "18%", backgroundColor: "#f8fafc" }]}>{formatMoney(v, c)}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>SECTION 4 — APPROVALS</Text>
            <View style={s.table}>
              <View style={s.tr}>
                {[
                  ["18%", "Level"],
                  ["20%", "Approver"],
                  ["14%", "Decision"],
                  ["16%", "Date & time"],
                  ["32%", "Comments"],
                ].map(([w, l]) => (
                  <Text key={l} style={[s.th, { width: w }]}>
                    {l}
                  </Text>
                ))}
              </View>
              {d.stages.map((st) => (
                <View key={st.order} style={s.tr}>
                  <View style={[s.td, { width: "18%" }]}>
                    <Text style={s.bold}>Level {st.order}</Text>
                    <Text style={{ color: MUTED, fontSize: 7.5 }}>{st.name}</Text>
                  </View>
                  <View style={[s.td, { width: "20%" }]}>
                    <Text>{st.record ? st.record.actorName : st.assignee}</Text>
                    {st.record && <Text style={{ color: MUTED, fontSize: 7.5 }}>{st.record.actorRole}</Text>}
                  </View>
                  <Text style={[s.td, s.bold, { width: "14%", color: st.record ? (st.record.decision === "APPROVED" ? "#047857" : st.record.decision === "REJECTED" ? "#b91c1c" : "#c2410c") : MUTED }]}>
                    {st.record ? DECISION_LABEL[st.record.decision] : st.state === "ACTIVE" ? "Awaiting decision" : "Pending"}
                  </Text>
                  <Text style={[s.td, { width: "16%" }]}>{st.record ? fmtDateTime(st.record.at) : "—"}</Text>
                  <Text style={[s.td, { width: "32%" }]}>{st.record?.comment ?? ""}</Text>
                </View>
              ))}
              {d.stages.length === 0 && (
                <View style={s.tr}>
                  <Text style={[s.td, { width: "100%", color: MUTED }]}>No approvals recorded.</Text>
                </View>
              )}
            </View>
            <Text style={s.note}>
              Approvals above are authenticated digital approval records captured by the internal Purchase Request system (user identity, role, decision and timestamp). They serve as
              internal approval and accountability records and are not certified electronic signatures.
            </Text>
          </View>

          {d.history.some((h) => h.decision !== "APPROVED") && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>APPROVAL HISTORY</Text>
              {d.history.map((h, i) => (
                <Text key={i} style={{ fontSize: 8, marginBottom: 3 }}>
                  {fmtDateTime(h.at)} · Rev. {h.revision} · {h.stageName}: {DECISION_LABEL[h.decision]} by {h.actorName}
                  {h.comment ? ` — “${h.comment}”` : ""}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View style={s.footer} fixed>
          <Text>
            {d.footerText ? `${d.footerText} · ` : ""}Generated {fmtDateTime(d.generatedAt)} by {d.generatedBy} · {d.entityCode}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${d.prNumber} · Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
