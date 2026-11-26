import type { DB } from "../db";
import { emailConfigured, sendEmail } from "../email";
import { appUrl } from "../env";

export type NotifyInput = {
  userIds: string[];
  type:
    | "PR_SUBMITTED"
    | "APPROVAL_REQUIRED"
    | "PR_STAGE_APPROVED"
    | "PR_REJECTED"
    | "CLARIFICATION_REQUESTED"
    | "PR_RESUBMITTED"
    | "PR_APPROVED"
    | "PR_CANCELLED"
    | "APPROVER_REASSIGNED"
    | "COMMENT_ADDED";
  title: string;
  body: string;
  requestId?: string;
  /** details rendered in the email (PR number, requester, amount, stage, action) */
  emailLines?: [string, string][];
  /** opens a section of the request page, e.g. "chat" */
  linkHash?: string;
  /** recipients who can act on the current stage: their email gets a "Review & approve" button */
  quickApproveFor?: string[];
};

type EmailExtras = { lines: [string, string][]; quickApprove: boolean; isChat: boolean };

/** Creates in-app notifications (inside the caller's transaction). Returns ids for optional email delivery. */
export async function notify(db: DB, n: NotifyInput): Promise<string[]> {
  const ids: string[] = [];
  const unique = [...new Set(n.userIds)];
  for (const userId of unique) {
    const row = await db.notification.create({
      data: {
        userId,
        type: n.type,
        title: n.title,
        body: n.body,
        requestId: n.requestId ?? null,
        link: n.requestId ? `/requests/${n.requestId}${n.linkHash ? `#${n.linkHash}` : ""}` : null,
      },
    });
    ids.push(row.id);
    emailDetailsById.set(row.id, {
      lines: n.emailLines ?? [],
      quickApprove: Boolean(n.requestId) && (n.type === "APPROVAL_REQUIRED" || (n.quickApproveFor ?? []).includes(userId)),
      isChat: n.type === "COMMENT_ADDED",
    });
  }
  return ids;
}

const emailDetailsById = new Map<string, EmailExtras>();

/**
 * Sends emails for notifications after the transaction commits. Failures never affect the
 * business operation — the in-app notification already exists.
 */
export async function deliverEmails(rootDb: DB, notificationIds: string[]) {
  if (!emailConfigured() || notificationIds.length === 0) {
    for (const id of notificationIds) emailDetailsById.delete(id);
    return;
  }
  const rows = await rootDb.notification.findMany({
    where: { id: { in: notificationIds } },
    include: { user: true, request: { include: { entity: true } } },
  });
  for (const r of rows) {
    const extras = emailDetailsById.get(r.id) ?? { lines: [], quickApprove: false, isChat: false };
    emailDetailsById.delete(r.id);
    if (!r.user.isActive) continue;
    if (r.request && !r.request.entity.emailNotifications) continue;
    try {
      const base = appUrl();
      await sendEmail({
        to: r.user.email,
        subject: `[IPRAMS] ${r.title}`,
        intro: r.body,
        lines: extras.lines,
        actions: [
          ...(r.link ? [{ label: extras.isChat ? "Reply in chat" : "Open purchase request", href: `${base}${r.link}` }] : []),
          // Sign-in is still required; the link opens the request with the Approve dialog ready.
          ...(extras.quickApprove && r.requestId ? [{ label: "Review & approve", href: `${base}/requests/${r.requestId}?decide=approve#approve`, tone: "green" as const }] : []),
        ],
      });
      await rootDb.notification.update({ where: { id: r.id }, data: { emailedAt: new Date() } });
    } catch (e) {
      console.error("[IPRAMS] Email delivery failed", r.id, e);
    }
  }
}
