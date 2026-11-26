import type { PermissionKey } from "@/server/auth/permissions";

/** Administration pages and the permission each needs. Shared by the sidebar and the admin layout. */
export const ADMIN_SECTIONS: { href: string; label: string; perm: PermissionKey }[] = [
  { href: "/admin/users", label: "Users", perm: "admin.users" },
  { href: "/admin/departments", label: "Departments", perm: "admin.departments" },
  { href: "/admin/categories", label: "Categories", perm: "admin.categories" },
  { href: "/admin/workflows", label: "Approval workflows", perm: "admin.workflows" },
  { href: "/admin/entities", label: "Entities", perm: "admin.entities" },
  { href: "/admin/roles", label: "Roles & permissions", perm: "admin.roles" },
  { href: "/admin/audit", label: "Audit log", perm: "audit.view" },
  { href: "/admin/settings", label: "System settings", perm: "admin.settings" },
];
