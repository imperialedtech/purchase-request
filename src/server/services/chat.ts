import type { DB } from "../db";
import type { Actor } from "../auth/actor";
import { notFound } from "../errors";
import { visibleRequestsWhere } from "./visibility";

export type ChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  /** capacity shown next to the name: Requestor, the approval stage, or the person's job title */
  role: string;
  kind: string;
  body: string;
  createdAt: string;
};

/**
 * Messages in a request's discussion, oldest first. Only people who can see the request can read
 * them (same visibility rules as the request itself). `after` returns only newer messages, for polling.
 */
export async function listMessages(db: DB, actor: Actor, requestId: string, after?: Date): Promise<ChatMessage[]> {
  const pr = await db.purchaseRequest.findFirst({
    where: { AND: [{ id: requestId }, visibleRequestsWhere(actor)] },
    select: { id: true, requesterId: true, stages: { select: { name: true, assignedUserId: true } }, approvals: { select: { actorId: true, stageName: true } } },
  });
  if (!pr) throw notFound();
  const rows = await db.purchaseRequestComment.findMany({
    where: { requestId, ...(after ? { createdAt: { gt: after } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const authors = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.authorId))] } }, select: { id: true, jobTitle: true } });
  const jobTitle = new Map(authors.map((a) => [a.id, a.jobTitle]));
  const roleOf = (id: string) => {
    if (id === pr.requesterId) return "Requestor";
    const decided = [...pr.approvals].reverse().find((a) => a.actorId === id);
    if (decided) return `${decided.stageName} approver`;
    const assigned = pr.stages.find((s) => s.assignedUserId === id);
    if (assigned) return `${assigned.name} approver`;
    return jobTitle.get(id) ?? "";
  };
  return rows.map((r) => ({ id: r.id, authorId: r.authorId, authorName: r.authorName, role: roleOf(r.authorId), kind: r.kind, body: r.body, createdAt: r.createdAt.toISOString() }));
}

/** Clears the user's unread chat notifications for a request once they have the conversation open. */
export async function markChatRead(db: DB, actor: Actor, requestId: string) {
  await db.notification.updateMany({ where: { userId: actor.id, requestId, type: "COMMENT_ADDED", readAt: null }, data: { readAt: new Date() } });
}

/** Conversations the user can see, most recently active first, with unread counts. */
export async function listConversations(db: DB, actor: Actor, q?: string) {
  const visible = visibleRequestsWhere(actor);
  const search = q?.trim();
  const latest = await db.purchaseRequestComment.findMany({
    where: {
      request: search
        ? { AND: [visible, { OR: [{ prNumber: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }, { requesterName: { contains: search, mode: "insensitive" } }] }] }
        : visible,
    },
    orderBy: { createdAt: "desc" },
    distinct: ["requestId"],
    take: 100,
    include: { request: { select: { id: true, prNumber: true, title: true, status: true, requesterName: true, _count: { select: { comments_: true } } } } },
  });
  const unread = await db.notification.groupBy({
    by: ["requestId"],
    where: { userId: actor.id, type: "COMMENT_ADDED", readAt: null, requestId: { in: latest.map((l) => l.requestId) } },
    _count: { _all: true },
  });
  const unreadBy = new Map(unread.map((u) => [u.requestId, u._count._all]));
  return latest.map((l) => ({
    requestId: l.requestId,
    prNumber: l.request.prNumber,
    title: l.request.title,
    status: l.request.status,
    requesterName: l.request.requesterName,
    messages: l.request._count.comments_,
    lastAuthor: l.authorName,
    lastAuthorIsMe: l.authorId === actor.id,
    lastBody: l.body,
    lastAt: l.createdAt,
    unread: unreadBy.get(l.requestId) ?? 0,
  }));
}
