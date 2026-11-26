import { requireActor } from "@/server/auth/session";
import { can, entitiesWith } from "@/server/auth/actor";
import { db } from "@/server/db";
import { awaitingMyApprovalWhere } from "@/server/services/visibility";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const isApprover = entitiesWith(actor, "approval.act").length > 0;
  const [unread, awaiting] = await Promise.all([
    db.notification.count({ where: { userId: actor.id, readAt: null } }),
    isApprover ? db.purchaseRequest.count({ where: awaitingMyApprovalWhere(actor) }) : Promise.resolve(0),
  ]);
  const anyAdmin = (["admin.users", "admin.departments", "admin.categories", "admin.workflows", "admin.entities", "admin.roles", "admin.settings", "audit.view"] as const).some(
    (p) => entitiesWith(actor, p).length > 0,
  );
  const canCreate = entitiesWith(actor, "pr.create").length > 0;

  const nav: NavItem[] = [
    { href: "/", label: "Dashboard", icon: "dashboard" },
    { href: "/requests", label: "Purchase Requests", icon: "requests" },
    ...(canCreate ? [{ href: "/my-requests", label: "My Requests", icon: "mine" } as NavItem] : []),
    ...(isApprover ? [{ href: "/approvals", label: "Approvals", icon: "approvals", badge: awaiting } as NavItem] : []),
    ...(can(actor, "report.view") ? [{ href: "/reports", label: "Reports", icon: "reports" } as NavItem] : []),
    { href: "/notifications", label: "Notifications", icon: "notifications", badge: unread },
    ...(anyAdmin ? [{ href: "/admin", label: "Administration", icon: "admin" } as NavItem] : []),
    { href: "/settings", label: "Settings", icon: "settings" },
  ];

  return (
    <AppShell nav={nav} unread={unread} canCreate={canCreate} user={{ name: actor.name, email: actor.email, jobTitle: actor.jobTitle, roles: actor.grants.map((g) => g.roleName) }}>
      {children}
    </AppShell>
  );
}
