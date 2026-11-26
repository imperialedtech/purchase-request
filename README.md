# IPRAMS — Internal Purchase Request & Approval Management System

Internal web application that replaces Imperial EdTech's paper Purchase Request (PR) form and its
three-level approval process, with architectural support for a second entity (PAVE).

- **Requestors** raise PRs through a guided form (Initiator → Comments → Description of Purchase → Documents → Review), save drafts, attach quotations and track status.
- **Approvers** act in strict sequence: **Level 1 Functional Responsible** (by category: Purchasing Officer / System Administrator) → **Level 2 Finance Manager** → **Level 3 Chief of Staff**. Each can approve, reject (reason required) or request clarification.
- Every decision is an authenticated, immutable **digital approval record**; the PDF reproduces the company form with real approval records only.
- Dashboards, search/filters, notifications (in-app + optional email), reports with CSV/Excel/PDF export, administration and an append-only audit log.

## Architecture

| Layer | Choice | Why |
|---|---|---|
| Web | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Lucide icons, Recharts | Preferred stack; one deployable unit |
| Server logic | Service layer in `src/server/services/*`, called from Server Actions and Route Handlers | All business rules and authorization run on the server and are unit-testable without HTTP |
| Database | PostgreSQL 16 via Prisma 6 | Relational schema, transactions, row locks, constraints and triggers |
| Auth | Built-in: bcrypt passwords, server-side sessions (random token, HMAC-hashed in DB, httpOnly cookie), admin invitations, lockout & rate limiting | Works on internal hosting with no external identity provider |
| Files | Private storage directory outside the web root, served only through authorized routes | Swappable for S3/Supabase Storage (3 functions in `src/server/storage.ts`) |
| PDF | `@react-pdf/renderer` (server-side) | A4 documents from the actual records |
| Email | Nodemailer over SMTP (optional) | Configured through environment variables only |

**Why not Supabase Auth/RLS?** The brief prefers Supabase, but all database access here happens on the
server through one service layer — the browser never talks to the database — so row-level
authorization is enforced centrally in `src/server/services/visibility.ts` and every service method.
The app runs on any PostgreSQL, **including a Supabase Postgres database** (just point `DATABASE_URL` at it).
If you later expose the database directly to clients, add RLS policies mirroring `visibility.ts`.

### Key design decisions
- **Workflow snapshot**: on submission the entity's active workflow is copied onto the PR (`approval_assignments`). Editing a workflow never changes routing or history of in-flight PRs.
- **PR numbering**: `IET-PR-2026-0001` from an atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` counter per entity/year, plus a `UNIQUE` constraint. Tested with concurrent submissions.
- **Race-safety**: submissions and decisions run in a transaction that takes `SELECT … FOR UPDATE` on the PR row; a stage can be decided only once.
- **Money**: decimal arithmetic (`decimal.js`/`NUMERIC`), recomputed on the server; the DB rejects a line total ≠ qty × unit price. Currencies are never summed together; Imperial EdTech enforces one currency per PR (configurable per entity).
- **Immutability**: database triggers make `audit_logs` and `purchase_request_approvals` append-only.
- **Revisions**: every (re)submission stores a snapshot of the PR, so values before a clarification are retained.
- **PAVE**: created as an entity with `isConfigured = false`. No PAVE roles, approvers or procedures are invented; PRs cannot be raised for PAVE until an administrator configures its workflow and marks it configured.

### Folder structure
```
prisma/            schema.prisma, migrations (incl. constraints/triggers), bootstrap, seed, setup-admin
src/app/(auth)     login, invitation / password reset
src/app/(app)      dashboard, requests, my-requests, approvals, reports, notifications, admin/*, settings
src/app/api        attachments, PR PDF, report export, entity logo (authorized route handlers)
src/app/actions    server actions (thin wrappers around services)
src/server         db, auth (sessions, permissions, actor), services (business logic), pdf, storage, email
src/components     UI kit, layout shell, request form/list/actions, admin editors, charts
tests/             integration tests (Vitest) against a separate test database
docs/              deployment, administrator and user guides
```

## Quick start (development)

Prerequisites: Node.js 20+ and Docker (or any PostgreSQL 14+).

```bash
cp .env.example .env              # then fill in values (see below)
docker volume create iprams_pgdata
npm run db:up                     # PostgreSQL on localhost:5434
npm install
npx prisma migrate deploy         # create schema
npm run db:seed                   # DEMO data only (users for every role + sample PRs)
npm run dev                       # http://localhost:3000
```

Minimum `.env` for development:
```
DATABASE_URL="postgresql://iprams:iprams_dev_password@localhost:5434/iprams?schema=public"
TEST_DATABASE_URL="postgresql://iprams:iprams_dev_password@localhost:5434/iprams_test?schema=public"
APP_URL="http://localhost:3000"
SESSION_SECRET="<64 random hex chars>"
SEED_DEMO_PASSWORD="<a password for the demo accounts>"
```

Demo accounts created by the seed are listed at the top of `prisma/seed.ts` (all use `SEED_DEMO_PASSWORD`).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Applies migrations to `TEST_DATABASE_URL` and runs the integration test suite |
| `npm run typecheck`, `npm run lint` | Static checks |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run setup:admin` | Production bootstrap + first administrator (prints activation link) |
| `npm run db:seed` | Demo data (refuses to run when `NODE_ENV=production`) |

## Documentation
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production configuration, migrations, hosting, backups
- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) — initial administrator setup and configuration
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — onboarding guide for requestors and approvers
- [docs/TESTING.md](docs/TESTING.md) — what is tested and how
- [docs/STATUS.md](docs/STATUS.md) — what is complete, known limitations and next steps
