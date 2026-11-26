import { requireActor } from "@/server/auth/session";
import { can, entitiesWith } from "@/server/auth/actor";
import { db } from "@/server/db";
import { awaitingMyApprovalWhere } from "@/server/services/visibility";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { ADMIN_SECTIONS } from "@/lib/admin-sections";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const isApprover = entitiesWith(actor, "approval.act").length > 0;
  const [unread, unreadMessages, awaiting] = await Promise.all([
    db.notification.count({ where: { userId: actor.id, readAt: null } }),
    db.notification.count({ where: { userId: actor.id, readAt: null, type: "COMMENT_ADDED" } }),
    isApprover ? db.purchaseRequest.count({ where: awaitingMyApprovalWhere(actor) }) : Promise.resolve(0),
  ]);
  const adminPages = ADMIN_SECTIONS.filter((s) => entitiesWith(actor, s.perm).length > 0).map(({ href, label }) => ({ href, label }));
  const canCreate = entitiesWith(actor, "pr.create").length > 0;

  const nav: NavItem[] = [
    { href: "/", label: "Dashboard", icon: "dashboard" },
    { href: "/requests", label: "Purchase Requests", icon: "requests" },
    ...(canCreate ? [{ href: "/my-requests", label: "My Requests", icon: "mine" } as NavItem] : []),
    ...(isApprover ? [{ href: "/approvals", label: "Approvals", icon: "approvals", badge: awaiting } as NavItem] : []),
    { href: "/messages", label: "Messages", icon: "messages", badge: unreadMessages },
    ...(can(actor, "report.view") ? [{ href: "/reports", label: "Reports", icon: "reports" } as NavItem] : []),
    { href: "/notifications", label: "Notifications", icon: "notifications", badge: unread },
    ...(adminPages.length ? [{ href: "/admin", label: "Administration", icon: "admin", children: [{ href: "/admin", label: "Overview" }, ...adminPages] } as NavItem] : []),
    { href: "/settings", label: "Settings", icon: "settings" },
  ];

  return (
    <AppShell nav={nav} unread={unread} canCreate={canCreate} user={{ name: actor.name, email: actor.email, jobTitle: actor.jobTitle, roles: actor.grants.map((g) => g.roleName) }}>
      {children}
    </AppShell>
  );
}
