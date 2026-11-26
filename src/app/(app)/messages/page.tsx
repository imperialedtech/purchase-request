import Link from "next/link";
import { MessagesSquare, Search } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { listConversations } from "@/server/services/chat";
import { Card, EmptyState, Input, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { cn, initials } from "@/lib/utils";

export const metadata = { title: "Messages" };

const ago = (d: Date) => {
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireActor();
  const { q } = await searchParams;
  const conversations = await listConversations(db, actor, q);
  const unreadTotal = conversations.reduce((a, c) => a + c.unread, 0);

  return (
    <>
      <PageHeader
        title="Messages"
        description="Conversations on purchase requests you can access. Open one to chat with the requestor and approvers."
        actions={<LinkButton href="/requests" variant="secondary">Start from a request</LinkButton>}
      />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <p className="text-sm text-slate-600">
            {conversations.length} conversation{conversations.length === 1 ? "" : "s"}
            {unreadTotal > 0 && <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">{unreadTotal} unread</span>}
          </p>
          <form className="relative w-full max-w-xs" role="search">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input name="q" defaultValue={q ?? ""} placeholder="Search PR number, title, requestor…" aria-label="Search conversations" className="pl-9" />
          </form>
        </div>
        {conversations.length === 0 ? (
          <EmptyState
            icon={<MessagesSquare className="h-8 w-8" />}
            title={q ? "No conversations match your search" : "No conversations yet"}
            description="Open any submitted purchase request and use the Discussion panel to message the requestor or approvers."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {conversations.map((c) => (
              <li key={c.requestId}>
                <Link href={`/requests/${c.requestId}#chat`} className={cn("flex items-start gap-4 px-5 py-4 transition-colors hover:bg-slate-50", c.unread > 0 && "bg-brand-50/40")}>
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-800">
                    {initials(c.requesterName)}
                    {c.unread > 0 && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-brand-600 ring-2 ring-surface" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-brand-700">{c.prNumber}</span>
                      <span className={cn("truncate text-sm", c.unread ? "font-semibold text-slate-900" : "text-slate-800")}>{c.title}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className={cn("mt-1 truncate text-sm", c.unread ? "text-slate-800" : "text-slate-500")}>
                      <span className="font-medium">{c.lastAuthorIsMe ? "You" : c.lastAuthor}:</span> {c.lastBody}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Requested by {c.requesterName} · {c.messages} message{c.messages === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[11px] whitespace-nowrap text-slate-500">{ago(c.lastAt)}</span>
                    {c.unread > 0 && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{c.unread}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
