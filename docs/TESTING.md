# Testing

`npm test` applies migrations to the separate database in `TEST_DATABASE_URL` (non-destructively)
and runs the Vitest integration suite against the real service layer and PostgreSQL. Each run
creates its own uniquely named users and categories, so it does not require an empty database.
To start from a clean test database, drop it manually (e.g. `DROP DATABASE iprams_test;`) — it is
recreated on the next run. Never point `TEST_DATABASE_URL` at production; the script refuses to run
if it equals `DATABASE_URL`.

## Coverage (64 tests)

**PR (tests/requests.test.ts)** — decimal line/PR totals; totals kept per currency; create draft with
initiator from the authenticated profile; edit draft with server-side recalculation (client-supplied
totals ignored); 25 line items; invalid quantities/prices rejected; single-currency rule and allowed
currencies; other users cannot edit a draft; PAVE (unconfigured) blocked; required fields at
submission; confirmation required; `IET-PR-YYYY-NNNN` numbering and Level 1 routing/notification;
double submission blocked; **12 concurrent submissions get unique sequential numbers**; duplicate PR
number rejected by the DB; atomic per-entity sequences; initiator frozen at submission.

**Approvals (tests/approvals.test.ts)** — full Level 1 → Finance → Chief of Staff → Approved with
final approver recorded; category-based Level 1 routing; Finance/CoS cannot act out of sequence;
employees, viewers and admins cannot approve; self-approval blocked, admins alerted, reassignment
audited; requester-approver blocked at later stages; same stage cannot be actioned twice;
**concurrent approvals produce exactly one decision**; rejection requires a reason and preserves
history; clarification → edit → resubmit returns to the returning stage with both revisions kept;
restart-from-Level-1 rule; cancellation rules; workflow edits do not affect in-flight PRs.

**Security & integrity (tests/security.test.ts)** — unrelated users cannot see a PR; drafts private
even from admins/viewers; approver visibility; entity isolation (PAVE-only user); restricted payment
details hidden; attachment authorization; file-type detection rejects disguised executables/HTML;
approval records and audit logs cannot be updated/deleted (DB trigger); DB rejects inconsistent line
totals and non-positive quantities; non-draft PR without number rejected; role permission checks;
employees cannot run reports or create users; only system admins change role permissions; reports
never mix currencies; login lockout and generic errors; deactivated users cannot sign in.

**Chat & dashboard (tests/chat.test.ts)** — messages reach the requestor and the current approver with
a link to the chat; role labels (Requestor / stage approver / job title); polling returns only newer
messages; people without access (other employees, other entities) cannot read, post or list the
conversation; anyone who joins is notified; unread counts clear when the chat is opened; empty
messages rejected; dashboard KPIs (approved this month, value, turnaround, approval rate) and the
per-stage pipeline.

## Manual / browser verification performed
Sign-in; dashboard with live data and charts; 5-step form with auto-save, attachments (valid upload
accepted, disguised and HTML files rejected), submit → PR number; Level 1 approval through the UI
moving the PR to Finance; admin invite → activation link → password policy → single-use link;
all admin pages, reports (all types) and exports (CSV/XLSX/PDF) return 200 for admins; employees are
redirected from Reports/Admin and get 403 on export; anonymous API calls get 401; uploads without a
same-origin header get 403; PR PDFs for approved and pending requests; mobile layouts of list and
detail pages; production build with no warnings.
