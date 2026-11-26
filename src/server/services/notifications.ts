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
};

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
        link: n.requestId ? `/requests/${n.requestId}` : null,
      },
    });
    ids.push(row.id);
  }
  for (const id of ids) emailDetailsById.set(id, n.emailLines ?? []);
  return ids;
}

const emailDetailsById = new Map<string, [string, string][]>();

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
    const lines = emailDetailsById.get(r.id) ?? [];
    emailDetailsById.delete(r.id);
    if (!r.user.isActive) continue;
    if (r.request && !r.request.entity.emailNotifications) continue;
    try {
      const base = appUrl();
      await sendEmail({
        to: r.user.email,
        subject: `[IPRAMS] ${r.title}`,
        intro: r.body,
        lines,
        link: r.link ? `${base}${r.link}` : undefined,
      });
      await rootDb.notification.update({ where: { id: r.id }, data: { emailedAt: new Date() } });
    } catch (e) {
      console.error("[IPRAMS] Email delivery failed", r.id, e);
    }
  }
}
