import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, Clock, Download, FileText, Lock, Paperclip, Pencil, RotateCcw, Send, XCircle, Ban, AlertCircle } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { getRequestForActor } from "@/server/services/requests";
import { AppError } from "@/server/errors";
import { Alert, Badge, Card, CardHeader, LinkButton, StatusBadge, Table, Td, Th } from "@/components/ui";
import { ApprovalPanel, CancelRequestButton, ReassignForm } from "@/components/requests/actions";
import { RequestChat } from "@/components/requests/chat";
import { listMessages } from "@/server/services/chat";
import { emailConfigured } from "@/server/email";
import { formatMoney, totalsByCurrency } from "@/lib/money";
import { DECISION_LABEL, STATUS_LABEL, type PRStatusKey } from "@/lib/status";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Purchase request" };

type TimelineEvent = { at: Date; kind: "submitted" | "resubmitted" | "approved" | "rejected" | "returned" | "cancelled"; title: string; who: string; role?: string; comment?: string | null; stage?: string };

export default async function RequestDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string; decide?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const justSubmitted = sp.submitted === "1";
  const actor = await requireActor();
  let data;
  try {
    data = await getRequestForActor(db, actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const { pr, caps, activeStage, paymentRestricted } = data;
  const totals = totalsByCurrency(pr.items.map((i) => ({ currency: i.currency, quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString() })));

  // ── timeline ──
  const events: TimelineEvent[] = [];
  for (const r of pr.revisions)
    events.push({ at: r.createdAt, kind: r.revision === 1 ? "submitted" : "resubmitted", title: r.revision === 1 ? "Submitted" : `Resubmitted (revision ${r.revision})`, who: pr.requesterName, role: "Requestor" });
  for (const a of pr.approvals)
    events.push({
      at: a.createdAt,
      kind: a.decision === "APPROVED" ? "approved" : a.decision === "REJECTED" ? "rejected" : "returned",
      title: `${DECISION_LABEL[a.decision]} — ${a.stageName}`,
      who: a.actorName,
      role: a.actorRole,
      comment: a.comment,
      stage: a.stageName,
    });
  if (pr.cancelledAt) events.push({ at: pr.cancelledAt, kind: "cancelled", title: "Cancelled", who: "", comment: pr.cancelReason });
  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  const [activity, approverOptions, messages] = await Promise.all([
    db.auditLog.findMany({ where: { requestId: pr.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, actorName: true, summary: true, createdAt: true, action: true } }),
    caps.canReassign
      ? db.user.findMany({
          where: {
            isActive: true,
            id: { not: pr.requesterId },
            entities: { some: { entityId: pr.entityId } },
            roles: { some: { OR: [{ entityId: null }, { entityId: pr.entityId }], role: { permissions: { some: { permission: { key: "approval.act" } } } } } },
          },
          select: { id: true, name: true, jobTitle: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    listMessages(db, actor, pr.id),
  ]);
  const cancelledBy = pr.cancelledById ? await db.user.findUnique({ where: { id: pr.cancelledById }, select: { name: true } }) : null;
  if (pr.cancelledAt) events.find((e) => e.kind === "cancelled")!.who = cancelledBy?.name ?? "";

  const icon = {
    submitted: <Send className="h-3.5 w-3.5" />,
    resubmitted: <RotateCcw className="h-3.5 w-3.5" />,
    approved: <CheckCircle2 className="h-3.5 w-3.5" />,
    rejected: <XCircle className="h-3.5 w-3.5" />,
    returned: <AlertCircle className="h-3.5 w-3.5" />,
    cancelled: <Ban className="h-3.5 w-3.5" />,
  };
  const iconTone = { submitted: "bg-blue-100 text-blue-700", resubmitted: "bg-blue-100 text-blue-700", approved: "bg-emerald-100 text-emerald-700", rejected: "bg-red-100 text-red-700", returned: "bg-orange-100 text-orange-700", cancelled: "bg-slate-200 text-slate-600" };

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 text-xs text-slate-500">
            <Link href="/requests" className="hover:underline">
              Purchase requests
            </Link>{" "}
            / {pr.entity.code}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">{pr.prNumber ?? "Draft request"}</h1>
            <StatusBadge status={pr.status} />
            {pr.revision > 1 && <Badge tone="gray">Revision {pr.revision}</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-600">{pr.title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {caps.canEdit && (
            <LinkButton href={`/requests/${pr.id}/edit`} variant={pr.status === "RETURNED" ? "primary" : "secondary"}>
              <Pencil className="h-4 w-4" /> {pr.status === "RETURNED" ? "Update & resubmit" : "Edit draft"}
            </LinkButton>
          )}
          {pr.status !== "DRAFT" && (
            <a href={`/api/requests/${pr.id}/pdf`} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-surface px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <Download className="h-4 w-4" /> {pr.status === "APPROVED" ? "Approved PR (PDF)" : "PDF"}
            </a>
          )}
          {caps.canCancel && <CancelRequestButton requestId={pr.id} />}
        </div>
      </div>

      {justSubmitted && activeStage && pr.requesterId === actor.id && (
        <Alert tone="green" title={`Purchase request ${pr.prNumber} submitted`}>
          Status: {STATUS_LABEL[pr.status as PRStatusKey]}. Next approver: Level {activeStage.stageOrder} · {activeStage.name}
          {activeStage.assignedUser ? ` — ${activeStage.assignedUser.name}` : activeStage.assignedRole ? ` — ${activeStage.assignedRole.name}` : ""}. You will be notified of each decision.
        </Alert>
      )}
      {pr.status === "RETURNED" && (
        <Alert tone="amber" title="Returned for clarification">
          {caps.canEdit ? "Review the approver's comments in the timeline, update the request and resubmit." : "Waiting for the requestor to respond and resubmit."}
        </Alert>
      )}
      {pr.status === "REJECTED" && <Alert tone="red" title="Rejected">{pr.rejectionReason}</Alert>}
      {pr.status === "CANCELLED" && <Alert tone="amber" title={`Cancelled ${fmtDate(pr.cancelledAt)}`}>{pr.cancelReason}</Alert>}
      {pr.status === "APPROVED" && (
        <Alert tone="green" title="Fully approved">
          Final approval by {pr.finalApproverName} on {fmtDateTime(pr.finalApprovedAt)}.
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {caps.canAct && activeStage && <ApprovalPanel requestId={pr.id} stageName={activeStage.name} requireComment={activeStage.requireCommentOnApprove} quickApprove={sp.decide === "approve"} />}
          {caps.selfApprovalBlocked && <Alert tone="amber">You raised this request, so you cannot approve it. An administrator can reassign this stage.</Alert>}

          <Card>
            <CardHeader title="Request information" />
            <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["PR number", pr.prNumber ?? "Assigned on submission"],
                ["Entity", `${pr.entity.name} (${pr.entity.code})`],
                ["Category", pr.category?.name ?? "—"],
                ["Requestor", pr.requesterName],
                ["Job title", pr.requesterJobTitle ?? "—"],
                ["Department", pr.departmentName ?? "—"],
                ["Request date", fmtDate(pr.submittedAt ?? pr.createdAt)],
                ["Requestor confirmation", pr.requesterConfirmedAt ? `Confirmed ${fmtDateTime(pr.requesterConfirmedAt)}` : "Not yet submitted"],
                ["Last updated", fmtDateTime(pr.updatedAt)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="mt-0.5 font-medium text-slate-900">{v}</dd>
                </div>
              ))}
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs text-slate-500">Comments / business justification</dt>
                <dd className="mt-1 whitespace-pre-wrap text-slate-800">{pr.comments || "—"}</dd>
              </div>
              {(pr.paymentDetails || paymentRestricted) && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="flex items-center gap-1 text-xs text-slate-500">
                    <Lock className="h-3 w-3" /> Payment details (restricted)
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap text-slate-800">{pr.paymentDetails ?? <span className="text-slate-400">Hidden — you are not authorised to view payment details.</span>}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Description of purchase" description="All prices VAT inclusive" />
            <Table>
              <thead>
                <tr>
                  <Th className="w-10">#</Th>
                  <Th>Description</Th>
                  <Th className="text-right">Qty</Th>
                  <Th>Currency</Th>
                  <Th className="text-right">Unit price</Th>
                  <Th className="text-right">Total price</Th>
                </tr>
              </thead>
              <tbody>
                {pr.items.map((i) => (
                  <tr key={i.id}>
                    <Td className="text-slate-400">{i.lineNo}</Td>
                    <Td>
                      <p className="font-medium text-slate-900">{i.description}</p>
                      {i.specifications && <p className="mt-0.5 text-xs text-slate-500">{i.specifications}</p>}
                    </Td>
                    <Td className="text-right">{i.quantity.toString()}</Td>
                    <Td>{i.currency}</Td>
                    <Td className="text-right whitespace-nowrap">{formatMoney(i.unitPrice.toString())}</Td>
                    <Td className="text-right font-medium whitespace-nowrap text-slate-900">{formatMoney(i.lineTotal.toString())}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {Object.entries(totals).map(([c, v]) => (
                  <tr key={c} className="bg-slate-50">
                    <td colSpan={5} className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Grand total ({c})
                    </td>
                    <td className="px-4 py-3 text-right text-base font-semibold whitespace-nowrap text-slate-900">{formatMoney(v, c)}</td>
                  </tr>
                ))}
              </tfoot>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Attachments" description={`${pr.attachments.length} file(s)`} />
            {pr.attachments.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">No supporting documents attached.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pr.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <Paperclip className="h-4 w-4 text-slate-400" />
                    <a className="min-w-0 flex-1 truncate font-medium text-brand-700 hover:underline" href={`/api/attachments/${a.id}`}>
                      {a.fileName}
                    </a>
                    {(a.mimeType.startsWith("image/") || a.mimeType === "application/pdf") && (
                      <a className="text-xs text-slate-500 hover:underline" href={`/api/attachments/${a.id}?inline=1`} target="_blank" rel="noopener">
                        Preview
                      </a>
                    )}
                    <span className="text-xs text-slate-400">{(a.sizeBytes / 1024).toFixed(0)} KB</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card id="chat" className="scroll-mt-24 overflow-hidden">
            <RequestChat
              requestId={pr.id}
              meId={actor.id}
              initial={messages}
              canPost={caps.canComment}
              emailEnabled={emailConfigured()}
              placeholder={pr.status === "RETURNED" && caps.canEdit ? "Respond to the clarification request…" : undefined}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Approval workflow" description={pr.stages.length ? "Sequential approval" : "Routing is assigned on submission"} />
            <ol className="space-y-0 p-5">
              {pr.stages.length === 0 && <p className="text-sm text-slate-500">Not yet submitted.</p>}
              {pr.stages.map((s, idx) => {
                const last = [...pr.approvals].reverse().find((a) => a.stageId === s.id);
                const done = s.state === "APPROVED";
                return (
                  <li key={s.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {idx < pr.stages.length - 1 && <span className={cn("absolute top-6 left-[11px] h-[calc(100%-18px)] w-px", done ? "bg-emerald-300" : "bg-slate-200")} />}
                    <span
                      className={cn(
                        "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                        done ? "bg-emerald-500 text-white" : s.state === "ACTIVE" ? "bg-brand-600 text-white ring-4 ring-brand-100" : s.state === "REJECTED" ? "bg-red-500 text-white" : s.state === "RETURNED" ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-500",
                      )}
                    >
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.state === "ACTIVE" ? <Clock className="h-3.5 w-3.5" /> : s.state === "REJECTED" ? <XCircle className="h-3.5 w-3.5" /> : <Circle className="h-2.5 w-2.5" />}
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-slate-900">
                        Level {s.stageOrder} · {s.name}
                      </p>
                      <p className="text-xs text-slate-500">{s.assignedUser ? `${s.assignedUser.name}${s.assignedUser.jobTitle ? `, ${s.assignedUser.jobTitle}` : ""}` : (s.assignedRole?.name ?? "—")}</p>
                      {done && last && <p className="mt-0.5 text-xs text-emerald-700">Approved by {last.actorName} · {fmtDateTime(last.createdAt)}</p>}
                      {s.state === "ACTIVE" && <p className="mt-0.5 text-xs text-brand-700">Awaiting decision since {fmtDateTime(s.activatedAt)}</p>}
                      {s.state === "REJECTED" && last && <p className="mt-0.5 text-xs text-red-700">Rejected by {last.actorName} · {fmtDateTime(last.createdAt)}</p>}
                      {s.state === "RETURNED" && last && <p className="mt-0.5 text-xs text-orange-700">Returned by {last.actorName} · {fmtDateTime(last.createdAt)}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card>
            <CardHeader title="Approval timeline" />
            <ol className="space-y-4 p-5">
              {events.length === 0 && <p className="text-sm text-slate-500">No approval activity yet.</p>}
              {events.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", iconTone[e.kind])}>{icon[e.kind]}</span>
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-slate-900">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {e.who}
                      {e.role ? ` · ${e.role}` : ""} · {fmtDateTime(e.at)}
                    </p>
                    {e.comment && <p className="mt-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs whitespace-pre-wrap text-slate-700">{e.comment}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {caps.canReassign && (
            <Card>
              <CardHeader title="Reassign approver" description="Administrative action — recorded in the audit log" />
              <div className="p-5">
                <ReassignForm
                  requestId={pr.id}
                  stages={pr.stages.filter((s) => s.state === "ACTIVE" || s.state === "WAITING").map((s) => ({ id: s.id, name: `Level ${s.stageOrder} · ${s.name}` }))}
                  approvers={approverOptions.map((u) => ({ id: u.id, name: `${u.name}${u.jobTitle ? ` (${u.jobTitle})` : ""}` }))}
                />
              </div>
            </Card>
          )}

          {pr.revisions.length > 1 && (
            <Card>
              <CardHeader title="Version history" description="Content as submitted at each revision" />
              <ul className="divide-y divide-slate-100 text-sm">
                {pr.revisions.map((r) => {
                  const s = r.snapshot as { totalAmount: string | null; currency: string | null; items: unknown[] };
                  return (
                    <li key={r.id} className="flex items-center justify-between px-5 py-2.5">
                      <span>
                        <FileText className="mr-2 inline h-3.5 w-3.5 text-slate-400" />
                        Revision {r.revision} · {fmtDateTime(r.createdAt)}
                      </span>
                      <span className="text-xs text-slate-600">
                        {s.items.length} item(s) · {s.totalAmount ? formatMoney(s.totalAmount, s.currency) : "multi-currency"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Activity log" />
            <ol className="max-h-96 space-y-3 overflow-y-auto p-5 text-xs">
              {activity.map((a) => (
                <li key={a.id}>
                  <p className="text-slate-800">{a.summary}</p>
                  <p className="text-slate-400">
                    {a.actorName} · {fmtDateTime(a.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
