# Deployment Guide

## 1. Requirements
- Node.js 20+ (tested on Node 26)
- PostgreSQL 14+ (managed Postgres, Supabase Postgres, Azure/AWS RDS, or self-hosted)
- HTTPS termination (reverse proxy such as Caddy/Nginx/IIS, or the hosting platform)
- Optional: an SMTP account for email notifications

## 2. Environment variables
Copy `.env.example` and set every value. Never commit `.env`.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string. For Supabase use the **direct** (port 5432) or session-pooler URL. |
| `APP_URL` | yes | Public HTTPS base URL; used in email links |
| `SESSION_SECRET` | yes | ≥ 32 chars random; generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Rotating it signs everyone out. |
| `SESSION_TTL_HOURS` | no | Default 12 |
| `STORAGE_DIR` | yes | Absolute path to a **persistent, backed-up** directory for attachments and logos, outside the web root |
| `MAX_UPLOAD_MB` | no | Default 10 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | no | Without them the app uses in-app notifications only and shows invitation links to the admin |
| `ADMIN_EMAIL`, `ADMIN_NAME` | setup only | Used by `npm run setup:admin` |
| `NODE_ENV` | yes | `production` (enables secure cookies and HSTS) |

## 3. First deployment
```bash
npm ci
npx prisma migrate deploy          # creates tables, constraints and append-only triggers
ADMIN_EMAIL=it.admin@yourdomain ADMIN_NAME="IT Admin" npm run setup:admin
npm run build
npm start                          # listens on PORT (default 3000)
```
`setup:admin` is idempotent: it creates the permission catalogue, system roles, the Imperial EdTech
entity with its standard 3-level workflow, default departments and categories, the PAVE placeholder
entity, and the first System Administrator. It prints a one-time activation link (valid 72 h).
**Do not run `npm run db:seed` in production** — it creates demo users.

## 4. Upgrades
```bash
git pull && npm ci
npx prisma migrate deploy
npm run build && <restart the service>
```

## 5. Hosting options

### Internal server / VM (recommended)
Run `npm start` under a process manager (systemd, PM2, NSSM on Windows) behind an HTTPS reverse
proxy. Set `STORAGE_DIR` to a persistent volume. This setup supports every feature as built.

### Vercel with a linked Supabase project (no manual variables)
If the Supabase project is linked to the Vercel project (Supabase → Project Settings → Integrations
→ Vercel, or Vercel → Storage), Vercel injects `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`,
`POSTGRES_PASSWORD`, `SUPABASE_URL`, … and the app needs **no** manually entered variables:

| Setting | Source when not set explicitly |
|---|---|
| Database (app / migrations) | `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` |
| Session key | `SUPABASE_JWT_SECRET`, else derived from `POSTGRES_PASSWORD` (set `SESSION_SECRET` to decouple it) |
| Public URL | `VERCEL_PROJECT_PRODUCTION_URL` |
| File storage | Supabase Storage if `SUPABASE_SERVICE_ROLE_KEY` exists, otherwise the `stored_objects` table in PostgreSQL |
| Upload limit | 4 MB on Vercel |

The `stored_objects_and_api_lockdown` migration enables Row Level Security on every table and revokes
Supabase's `anon`/`authenticated` privileges, so nothing is reachable through Supabase's public REST API.

### Vercel + Supabase (manual variables)
The app is Vercel-ready: files go to a **private** Supabase Storage bucket (`STORAGE_DRIVER=supabase`),
rate limits live in PostgreSQL, and the `vercel-build` script runs `prisma migrate deploy` before
every build. Functions run in London (`lhr1`, see `vercel.json`), so create Supabase in London too.

**A. Supabase** (Imperial EdTech's own organization)
1. Create a project, region **West EU (London) — eu-west-2**. Save the database password.
2. *Connect* (top bar) → **ORMs → Prisma**: copy the two strings.
   - Transaction pooler (port 6543) → `DATABASE_URL`, ending in `?pgbouncer=true&connection_limit=1`
   - Session pooler (port 5432) → `DIRECT_URL`
3. *Project Settings → API*: copy the **Project URL** and the **service_role** secret key.
   The private bucket `iprams-private` is created automatically on first upload (or create it yourself; it must not be public).

**B. Vercel** (`imperial-ed-tech/purchase-request`)
1. *Settings → Git*: connect the GitHub repo `imperialedtech/purchase-request`, production branch `main`.
2. *Settings → Environment Variables* (Production + Preview), all marked **Sensitive** where offered:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase transaction pooler string (`…:6543/postgres?pgbouncer=true&connection_limit=1`) |
   | `DIRECT_URL` | Supabase session pooler string (`…:5432/postgres`) |
   | `SESSION_SECRET` | 64 random hex characters |
   | `APP_URL` | the production URL, e.g. `https://purchase-request.vercel.app` or your custom domain |
   | `STORAGE_DRIVER` | `supabase` |
   | `SUPABASE_URL` | Supabase Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |
   | `SUPABASE_STORAGE_BUCKET` | `iprams-private` |
   | `MAX_UPLOAD_MB` | `4` (Vercel caps request bodies at about 4.5 MB) |
   | `SMTP_*` | optional, see the table above |

3. *Deployments → Redeploy* (or push to `main`). The build applies migrations automatically.

**C. Create the first administrator** (once, from your own PC — never paste the connection string into chat):
```powershell
cd iprams
$env:DATABASE_URL="<DIRECT_URL value>"; $env:DIRECT_URL="<DIRECT_URL value>"; $env:APP_URL="<production URL>"; $env:ADMIN_EMAIL="you@imperialedtech.com"; $env:ADMIN_NAME="Your Name"
npm run setup:admin
```
Open the printed activation link, set a password, then continue with ADMIN_GUIDE.md.

**Notes**
- Do not run `npm run db:seed` against this database.
- Supabase's REST API is not used by the app; you may keep the `public` schema closed to the Data API (*Settings → API → Exposed schemas*) since only the server connects, via Postgres.
- Back up with Supabase's daily backups (PITR on paid plans) plus a periodic `pg_dump` using `DIRECT_URL`; Storage objects are backed up separately (see section 7).

## 6. Security checklist
- [ ] HTTPS only; `NODE_ENV=production` (secure cookies + HSTS are enabled automatically)
- [ ] `SESSION_SECRET` is unique and stored in the platform's secret store
- [ ] Database user has only the privileges the app needs; database not exposed publicly
- [ ] `STORAGE_DIR` is not inside `public/` and not served by the web server directly
- [ ] Backups configured and restore tested (below)
- [ ] Demo seed never run against production; demo accounts absent
- [ ] SMTP credentials only in environment variables

## 7. Backup & restore strategy
What to back up: the PostgreSQL database **and** the `STORAGE_DIR` directory (attachments, logos).

- **Database**: nightly `pg_dump -Fc "$DATABASE_URL" > iprams-$(date +%F).dump`; keep 30 daily + 12 monthly copies off-site. Managed providers' point-in-time recovery is preferred where available.
- **Files**: nightly incremental copy of `STORAGE_DIR` (e.g. `restic`, `rclone`, or Azure/AWS backup) to the same retention.
- **Restore**: `pg_restore --clean --no-owner -d "$DATABASE_URL" iprams-YYYY-MM-DD.dump`, restore `STORAGE_DIR` from the same date, start the app. Test a restore at least quarterly.
- Audit and approval tables are append-only by trigger; restoring a dump recreates the triggers.

## Email with Google Workspace

1. Pick the mailbox that sends (for example support@ or a dedicated iprams@ user). It needs
   2-Step Verification turned on.
2. Signed in as that mailbox, create an app password at https://myaccount.google.com/apppasswords
   (name it "IPRAMS"). Copy the 16-character password; spaces don't matter.
3. In Vercel → Settings → Environment Variables (Production), add:

   | Name | Value |
   |---|---|
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `465` |
   | `SMTP_USER` | the mailbox address |
   | `SMTP_PASSWORD` | the app password (mark it Sensitive) |
   | `SMTP_FROM` | `IPRAMS <the mailbox address>` |

4. Redeploy, then use Administration → System settings → **Send test email to me**. If it fails,
   the message shown is Google's reason (for example a wrong app password).

`SMTP_FROM` must be the mailbox itself or an alias it owns, or Google rewrites the sender.
Google Workspace allows about 2,000 messages a day per mailbox. Port 465 uses TLS automatically.
