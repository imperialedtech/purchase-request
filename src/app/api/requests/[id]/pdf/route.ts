import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/server/db";
import { getActor } from "@/server/auth/session";
import { getRequestForActor } from "@/server/services/requests";
import { getSettings } from "@/server/services/admin";
import { audit } from "@/server/services/audit";
import { getObject } from "@/server/storage";
import { contentDisposition, errorResponse } from "@/server/http";
import { PrDocument, type PrPdfData } from "@/server/pdf/pr-document";
import { totalsByCurrency } from "@/lib/money";

export const runtime = "nodejs";

async function loadLogo(entity: { code: string; logoKey: string | null }): Promise<{ logo: PrPdfData["logo"]; onDark: boolean }> {
  if (entity.logoKey) {
    try {
      const data = await getObject(entity.logoKey);
      const format = data[0] === 0x89 ? "png" : "jpg";
      return { logo: { data, format }, onDark: false };
    } catch {
      /* fall through */
    }
  }
  if (entity.code === "IET") {
    try {
      const data = await readFile(path.join(process.cwd(), "public/brand/iet-logo-white.png"));
      return { logo: { data, format: "png" }, onDark: true };
    } catch {
      /* no logo */
    }
  }
  return { logo: null, onDark: true };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    const { id } = await params;
    const { pr } = await getRequestForActor(db, actor, id);
    if (pr.status === "DRAFT" || !pr.prNumber) return NextResponse.json({ error: "A PDF is available once the request is submitted" }, { status: 400 });
    const settings = await getSettings(db);
    const { logo, onDark } = await loadLogo(pr.entity);

    // Only real, recorded decisions are printed. For each stage take the latest decision of the
    // current revision; stages without one print as pending.
    const stages = pr.stages.map((st) => {
      const rec = [...pr.approvals].reverse().find((a) => a.stageId === st.id && a.revision === pr.revision);
      const showRec = rec && (st.state === "APPROVED" || st.state === "REJECTED" || st.state === "RETURNED");
      return {
        order: st.stageOrder,
        name: st.name,
        assignee: st.assignedUser?.name ?? st.assignedRole?.name ?? "—",
        state: st.state,
        record: showRec ? { actorName: rec.actorName, actorRole: rec.actorRole, decision: rec.decision, comment: rec.comment, at: rec.createdAt } : null,
      };
    });

    const data: PrPdfData = {
      entityName: pr.entity.name,
      entityCode: pr.entity.code,
      logo,
      logoOnDark: onDark,
      footerText: pr.entity.pdfFooterText,
      prNumber: pr.prNumber,
      status: pr.status,
      title: pr.title,
      category: pr.category?.name ?? null,
      requesterName: pr.requesterName,
      requesterJobTitle: pr.requesterJobTitle,
      departmentName: pr.departmentName,
      submittedAt: pr.submittedAt,
      confirmedAt: pr.requesterConfirmedAt,
      comments: pr.comments,
      showComments: settings.pdfShowComments,
      items: pr.items.map((i) => ({ lineNo: i.lineNo, description: i.description, specifications: i.specifications, quantity: i.quantity.toString(), currency: i.currency, unitPrice: i.unitPrice.toString(), lineTotal: i.lineTotal.toString() })),
      totals: totalsByCurrency(pr.items.map((i) => ({ currency: i.currency, quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString() }))),
      stages,
      history: pr.approvals.map((a) => ({ stageName: a.stageName, actorName: a.actorName, decision: a.decision, comment: a.comment, at: a.createdAt, revision: a.revision })),
      finalApprovedAt: pr.finalApprovedAt,
      generatedAt: new Date(),
      generatedBy: actor.name,
    };
    const buf = await renderToBuffer(PrDocument(data));
    await audit(db, { actor, action: "PR_PDF_GENERATED", targetType: "PurchaseRequest", targetId: pr.id, entityId: pr.entityId, requestId: pr.id, prNumber: pr.prNumber, summary: `${pr.prNumber} PDF generated (${pr.status.toLowerCase()})` });
    const suffix = pr.status === "APPROVED" ? "-approved" : "";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition("inline", `${pr.prNumber}${suffix}.pdf`),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
