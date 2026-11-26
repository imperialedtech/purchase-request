import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { NotificationsList } from "@/components/notifications-list";
import { PageHeader, buttonClass } from "@/components/ui";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string; filter?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = { userId: actor.id, ...(sp.filter === "unread" ? { readAt: null } : {}) };
  const [items, unread, total] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30 }),
    db.notification.count({ where: { userId: actor.id, readAt: null } }),
    db.notification.count({ where }),
  ]);
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <div className="flex gap-1 rounded-md bg-slate-100 p-1 text-xs">
            <Link href="/notifications" className={sp.filter !== "unread" ? "rounded bg-white px-3 py-1 font-medium shadow-sm" : "px-3 py-1 text-slate-600"}>
              All
            </Link>
            <Link href="/notifications?filter=unread" className={sp.filter === "unread" ? "rounded bg-white px-3 py-1 font-medium shadow-sm" : "px-3 py-1 text-slate-600"}>
              Unread
            </Link>
          </div>
        }
      />
      <NotificationsList
        unread={unread}
        items={items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString(), type: n.type }))}
      />
      {total > page * 30 && (
        <div className="mt-4 flex justify-center">
          <Link className={buttonClass("secondary", "sm")} href={`/notifications?page=${page + 1}${sp.filter ? `&filter=${sp.filter}` : ""}`}>
            Older notifications
          </Link>
        </div>
      )}
    </>
  );
}
