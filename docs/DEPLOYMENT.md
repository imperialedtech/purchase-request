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

### Vercel
The application builds on Vercel, but note:
- **File storage**: Vercel's filesystem is ephemeral. Replace the three functions in `src/server/storage.ts` with an object store (Supabase Storage, S3, Azure Blob) before using attachments/logos on Vercel.
- **Rate limiting** is in-memory per instance; on serverless use a shared store (e.g. Upstash Redis) in `src/server/auth/rate-limit.ts`. Account lockout is stored in the database and works everywhere.
- Use a pooled Postgres connection string suitable for serverless.

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
