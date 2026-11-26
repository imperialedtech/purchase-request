# Administrator Guide

## 1. Activate the first administrator
After deployment, run `npm run setup:admin` (see DEPLOYMENT.md) and open the printed activation
link to set a password. Sign in and open **Administration → Overview**. The *Configuration checks*
panel lists anything that still blocks users (e.g. categories without a Level 1 approver).

## 2. Set up users (Administration → Users → Invite user)
For each person enter name, work email, job title and department, tick the entity (Imperial EdTech),
and assign roles. A user may hold several roles.

| Role | Typical holder | What it allows |
|---|---|---|
| Requestor / Employee | all staff | create, submit, track and cancel own PRs |
| Level 1 Approver | Purchasing Officer, System Administrator (IT) | approve PRs routed to them by category |
| Finance Manager | Finance Manager | Level 2 approval, financial reports |
| Chief of Staff | Chief of Staff | final Level 3 approval, all PRs, reports |
| Finance / Reporting Viewer | accountants, auditors | read-only PRs and reports |
| System Administrator | IT administrators | configuration; **cannot approve** PRs |

Approvers normally also hold *Requestor / Employee* so they can raise their own requests.

When you create a user the system generates a **one-time activation link** (valid 7 days). If SMTP
is configured it is emailed; otherwise copy it from the screen and send it securely. Use
*Generate password reset link* on the user page for forgotten passwords. Users are never deleted —
deactivate them so their history stays attributable. Deactivation signs them out immediately.

## 3. Assign Level 1 approvers (Administration → Categories)
Each category routes Level 1 to one functional responsible, as on the paper form:
- IT Equipment, Software & Subscriptions → **System Administrator**
- Office Equipment, Office Supplies, Services, Marketing, Travel, Other → **Purchasing Officer**

Requests in a category without an approver cannot be submitted. You can add, rename or deactivate categories.

## 4. Approval workflow (Administration → Approval workflows)
Imperial EdTech ships with: Level 1 *Functional Responsible* (category approver) → Level 2
*Finance Manager* (role) → Level 3 *Chief of Staff* (role). Options per stage: comment required to
approve, escalation hours (flags overdue items). Workflow option *After clarification, resubmitted
requests go to*: the stage that returned it (default) or restart at Level 1.

Changing a workflow creates a new version and is audited. **Requests already submitted keep the
routing they were submitted with.**

## 5. Reassigning an approver
If an approver is absent, or the requester is also the stage approver (self-approval is blocked),
open the PR and use **Reassign approver** (requires the *approval.reassign* permission). Admins are
notified automatically when a stage has no eligible approver. Every reassignment is audited.

## 6. Entities (Administration → Entities)
Configure name, code, PR number format (`{CODE}-PR-{YEAR}-{SEQ}`), sequence digits, currency rule,
allowed/default currencies, PDF footer, logo, email notifications and the *self-approval* exception
(off by default; turning it on is audited). The entity code cannot change once PR numbers exist.

### Onboarding PAVE
PAVE exists but is **Not configured**, so nobody can raise PAVE requests yet. When PAVE's PR template
and procedures are supplied:
1. Create any PAVE-specific roles (Roles & permissions → Create role).
2. Add PAVE departments and categories; assign Level 1 approvers if PAVE uses category routing.
3. Build PAVE's workflow in Approval workflows.
4. Give users access to the PAVE entity and assign roles (optionally scoped to PAVE only).
5. Tick **Configured** on the PAVE entity.
If PAVE's form needs fields the Imperial EdTech form does not have, that requires a development change.

## 7. Roles & permissions
The matrix shows which permissions each role grants. Only System Administrators may change it; every
change is audited. The System Administrator role must keep `admin.roles`.

## 8. Audit log
Administration → Audit log lists every significant action (PR lifecycle, approvals, uploads,
role/workflow/entity changes, sign-ins, exports) with before/after values. Entries cannot be edited
or deleted — the database rejects such operations.

## 9. System settings
Company name (reports), support email, overdue threshold and whether PR PDFs include the comments
section. Email (SMTP) is configured through environment variables only.
