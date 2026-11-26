# Status Report

## Complete and verified
| Area | Status |
|---|---|
| Authentication (password + server sessions, invitations, reset links, lockout, rate limiting) | Done — tested + browser-verified |
| Role-based access (6 roles, editable permission matrix, multi-role, entity-scoped grants) | Done — tested |
| Entity architecture (IET configured; PAVE placeholder, not configurable for PRs until supplied) | Done |
| PR form (5 guided steps, drafts, line items, server-recalculated totals, currencies, attachments, unsaved-change warning, confirmation) | Done — browser-verified |
| Automatic, concurrency-safe numbering `IET-PR-YYYY-NNNN` | Done — tested with concurrent submissions |
| Sequential workflow (category Level 1 → Finance → Chief of Staff), approve / reject / clarify / resubmit / cancel, self-approval prevention, reassignment | Done — tested + browser-verified |
| Approval timeline, workflow progress, version history, comments, activity log | Done |
| Immutable approval records and audit log (DB triggers) | Done — tested |
| Dashboard (8 cards, 10 widgets, all from live, permission-filtered data) | Done |
| PR list: search, 10 filters, sorting, pagination, mobile cards | Done |
| Notifications (in-app inbox, unread count, mark read/all) + SMTP email | In-app done; email built but **not tested against a real SMTP server** (none configured) |
| PDF: submitted and approved PR documents (A4, company form structure, real records only) | Done — verified visually |
| Reports (11 types, 7 filters, per-currency totals) + CSV / Excel / PDF export | Done — exports verified |
| Administration: users, departments, categories, workflows, entities (+logo), roles, audit log, settings | Done |
| Tests: 50 integration tests; typecheck, lint and production build clean | Done |

## Not implemented / limitations
- **Delegation rules** (automatic out-of-office delegation) are not implemented; use *Reassign approver*.
- **Escalation** flags overdue approvals on the Approvals page; there is no scheduled job that sends escalation reminders.
- **Currency conversion** is intentionally not implemented; totals are always per currency.
- **Certified e-signatures** are not integrated; approvals are internal authenticated records (stated on the PDF).
- **Revision comparison**: every submitted version is stored and listed with its totals; there is no side-by-side diff view yet.
- **Storage** supports a local directory or a private Supabase Storage bucket; rate limits are stored in PostgreSQL, so both work on Vercel.
- **PAVE**: no PAVE-specific form fields, roles or workflow exist by design, pending its actual template.
- **Automated browser (E2E) tests** are not included; UI flows were verified manually in a browser.

## Local environment notes
- Dev database runs in Docker container `iprams-db` on port 5434 (volume `iprams_pgdata`).
- `scripts/dev-session.ts` (development only) prints a session token for a seeded user, used for scripted smoke tests.
