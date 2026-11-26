"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MessageSquareWarning, XCircle, Ban, UserCog } from "lucide-react";
import { Alert, Button, Field, Select, Textarea, buttonClass } from "@/components/ui";
import { cancelAction, decideAction, reassignAction } from "@/app/actions/requests";

type Decision = "APPROVED" | "REJECTED" | "CLARIFICATION_REQUESTED";

export function ApprovalPanel({ requestId, stageName, requireComment, quickApprove }: { requestId: string; stageName: string; requireComment: boolean; quickApprove?: boolean }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [decision, setDecision] = useState<Decision | null>(quickApprove ? "APPROVED" : null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);

  // Arriving from the "Review & approve" email button: open the Approve confirmation straight away.
  // The approver still confirms here, signed in, so a link scanner opening the email can't approve.
  useEffect(() => {
    if (quickApprove && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [quickApprove]);

  const needsComment = decision === "REJECTED" || decision === "CLARIFICATION_REQUESTED" || (decision === "APPROVED" && requireComment);
  const labels: Record<Decision, string> = { APPROVED: "Approve", REJECTED: "Reject", CLARIFICATION_REQUESTED: "Request clarification" };

  function open(d: Decision) {
    setDecision(d);
    setResult(null);
    dialog.current?.showModal();
  }

  function confirm() {
    if (!decision) return;
    if (needsComment && comment.trim().length < 3) {
      setResult({ ok: false, text: decision === "REJECTED" ? "Enter the reason for rejection" : decision === "APPROVED" ? "A comment is required at this stage" : "Explain what clarification is needed" });
      return;
    }
    start(async () => {
      const r = await decideAction(requestId, decision, comment);
      if (r.ok) {
        dialog.current?.close();
        setResult({ ok: true, text: r.message ?? "Done" });
        setComment("");
        router.refresh();
      } else setResult({ ok: false, text: r.error });
    });
  }

  return (
    <div id="approve" className="scroll-mt-24 rounded-lg border border-brand-200 bg-brand-50/60 p-4">
      <p className="text-sm font-semibold text-slate-900">Your decision is required</p>
      <p className="mt-0.5 text-xs text-slate-600">You are the {stageName} approver for this request.</p>
      {result?.ok && <Alert tone="green" className="mt-3">{result.text}</Alert>}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button variant="success" onClick={() => open("APPROVED")}>
          <CheckCircle2 className="h-4 w-4" /> Approve
        </Button>
        <Button variant="secondary" onClick={() => open("CLARIFICATION_REQUESTED")}>
          <MessageSquareWarning className="h-4 w-4 text-amber-600" /> Clarify
        </Button>
        <Button variant="danger" onClick={() => open("REJECTED")}>
          <XCircle className="h-4 w-4" /> Reject
        </Button>
      </div>
      <dialog ref={dialog} className="m-auto w-[min(94vw,480px)] rounded-lg p-0 shadow-xl">
        <div className="space-y-3 p-5">
          <h3 className="font-semibold text-slate-900">{decision ? labels[decision] : ""} — {stageName}</h3>
          <p className="text-sm text-slate-600">
            {decision === "APPROVED" && "Your approval will be recorded with your name, role, date and time, and the request will move to the next stage."}
            {decision === "REJECTED" && "The request will be closed as rejected. The requestor will be notified with your reason."}
            {decision === "CLARIFICATION_REQUESTED" && "The request will be returned to the requestor to update and resubmit."}
          </p>
          {result && !result.ok && <Alert tone="red">{result.text}</Alert>}
          <Field label={needsComment ? (decision === "REJECTED" ? "Reason for rejection" : decision === "APPROVED" ? "Comment" : "Clarification needed") : "Comment (optional)"} required={needsComment}>
            <Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={4000} autoFocus />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button type="button" className={buttonClass("secondary")} onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <Button variant={decision === "REJECTED" ? "danger" : decision === "APPROVED" ? "success" : "warning"} onClick={confirm} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Confirm {decision ? labels[decision].toLowerCase() : ""}
          </Button>
        </div>
      </dialog>
    </div>
  );
}

export function CancelRequestButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="secondary" onClick={() => dialog.current?.showModal()}>
        <Ban className="h-4 w-4" /> Cancel request
      </Button>
      <dialog ref={dialog} className="m-auto w-[min(94vw,440px)] rounded-lg p-0 shadow-xl">
        <div className="space-y-3 p-5">
          <h3 className="font-semibold text-slate-900">Cancel this purchase request?</h3>
          <p className="text-sm text-slate-600">Cancelled requests stay in the history and reports but can no longer be approved.</p>
          {error && <Alert tone="red">{error}</Alert>}
          <Field label="Reason" required>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button type="button" className={buttonClass("secondary")} onClick={() => dialog.current?.close()}>
            Keep request
          </button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await cancelAction(requestId, reason);
                if (r.ok) {
                  dialog.current?.close();
                  router.refresh();
                } else setError(r.error);
              })
            }
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Cancel request
          </Button>
        </div>
      </dialog>
    </>
  );
}

export function ReassignForm({ requestId, stages, approvers }: { requestId: string; stages: { id: string; name: string }[]; approvers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!stages.length) return null;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await reassignAction(requestId, stageId, userId, reason);
          setMsg(r.ok ? { ok: true, text: r.message ?? "Reassigned" } : { ok: false, text: r.error });
          if (r.ok) {
            setReason("");
            router.refresh();
          }
        });
      }}
    >
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
      <Field label="Stage">
        <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="New approver">
        <Select value={userId} onChange={(e) => setUserId(e.target.value)} required>
          <option value="">Select approver…</option>
          {approvers.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Reason">
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={500} />
      </Field>
      <Button type="submit" variant="secondary" size="sm" disabled={pending || !userId || !reason.trim()}>
        <UserCog className="h-3.5 w-3.5" /> Reassign approver
      </Button>
    </form>
  );
}
