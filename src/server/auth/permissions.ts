// Permission catalogue and default role → permission mapping.
// Roles and their permissions live in the database and are editable by administrators;
// this file only defines the catalogue and the defaults used by bootstrap/seed.

export const PERMISSIONS = {
  "pr.create": "Create, edit and submit own purchase requests",
  "pr.view_all": "View all submitted purchase requests in assigned entities",
  "pr.view_payment_details": "View restricted payment details on purchase requests",
  "pr.cancel_any": "Cancel any non-final purchase request",
  "approval.act": "Approve, reject or request clarification on assigned approval stages",
  "approval.reassign": "Reassign the approver of a pending stage",
  "report.view": "View reports and financial summaries",
  "report.export": "Export reports (CSV, Excel, PDF)",
  "admin.users": "Manage users, invitations and role assignments",
  "admin.departments": "Manage departments",
  "admin.categories": "Manage purchase categories and Level 1 approvers",
  "admin.workflows": "Configure approval workflows",
  "admin.entities": "Manage entities and their settings",
  "admin.roles": "Manage roles and permissions",
  "admin.settings": "Manage system settings",
  "audit.view": "View the audit log",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ROLE_DEFAULTS: Record<string, { name: string; description: string; permissions: PermissionKey[] }> = {
  SYSTEM_ADMIN: {
    name: "System Administrator",
    description: "Manages users, entities, workflows and settings",
    permissions: Object.keys(PERMISSIONS).filter((p) => p !== "approval.act") as PermissionKey[],
  },
  EMPLOYEE: {
    name: "Requestor / Employee",
    description: "Creates and tracks own purchase requests",
    permissions: ["pr.create"],
  },
  LEVEL1_APPROVER: {
    name: "Level 1 Approver (Functional Responsible)",
    description: "Approves purchase requests for assigned categories",
    permissions: ["approval.act"],
  },
  FINANCE_MANAGER: {
    name: "Finance Manager",
    description: "Level 2 financial review",
    permissions: ["approval.act", "pr.view_payment_details", "report.view", "report.export"],
  },
  CHIEF_OF_STAFF: {
    name: "Chief of Staff",
    description: "Final (Level 3) approval",
    permissions: ["approval.act", "pr.view_payment_details", "pr.view_all", "report.view", "report.export"],
  },
  FINANCE_VIEWER: {
    name: "Finance / Reporting Viewer",
    description: "Read-only access to purchase requests and financial reports",
    permissions: ["pr.view_all", "report.view", "report.export"],
  },
};
