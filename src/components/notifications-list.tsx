"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { markNotificationsReadAction } from "@/app/actions/requests";
import { Button, Card, EmptyState } from "@/components/ui";
import { cn, fmtDateTime } from "@/lib/utils";

type N = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string; type: string };

export function NotificationsList({ items, unread }: { items: N[]; unread: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const mark = (ids: string[] | "all") =>
    start(async () => {
      await markNotificationsReadAction(ids);
      router.refresh();
    });
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{unread}</span> unread
        </p>
        <Button variant="secondary" size="sm" disabled={pending || unread === 0} onClick={() => mark("all")}>
          <CheckCheck className="h-3.5 w-3.5" /> Mark all as read
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<Bell className="h-10 w-10" />} title="No notifications" description="You'll be notified about approvals, decisions and comments on your requests." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((n) => (
            <li key={n.id} className={cn("flex gap-3 px-5 py-3.5", !n.readAt && "bg-brand-50/40")}>
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-600")} />
              <div className="min-w-0 flex-1">
                <Link
                  href={n.link ?? "#"}
                  onClick={() => {
                    if (!n.readAt) void markNotificationsReadAction([n.id]);
                  }}
                  className={cn("text-sm hover:underline", n.readAt ? "text-slate-700" : "font-semibold text-slate-900")}
                >
                  {n.title}
                </Link>
                <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                <p className="mt-1 text-xs text-slate-400">{fmtDateTime(n.createdAt)}</p>
              </div>
              {!n.readAt && (
                <button className="self-start text-xs text-slate-500 hover:text-slate-800" onClick={() => mark([n.id])} disabled={pending}>
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
