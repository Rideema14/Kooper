# Deployment

> Nothing here has been deployed from this repository yet. These steps are the intended path; verify each on your own account.

## Option A — Vercel + Supabase (both have free tiers)

1. **Supabase**: create a project. Copy the *Transaction pooler* connection string (port 6543) for runtime, and the *direct* string (port 5432) for migrations.
2. **Migrate** (from your machine, using the direct string):
   ```bash
   for f in prisma/migrations/*/migration.sql; do psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f "$f"; done
   ```
   Only run each migration once; keep track of which you've applied (or use `npx prisma migrate deploy`, which does this for you when Prisma's engines are reachable).
3. **Vercel**: import the repo. Environment variables: `DATABASE_URL` (pooled, add `?pgbouncer=true&connection_limit=1`), `AUTH_SECRET`, `APP_URL` (your https URL), and optionally `GEMINI_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM`. Set `DB_POOL_MAX=1` on serverless.
4. Deploy, then check `https://your-app/api/health` returns `{"ok":true,"db":"up"}`.
5. Create your account at `/signup`. Don't run the seed in production (it refuses).

### Known limits on serverless
- **Rate limiting is in-memory per instance.** On Vercel each instance has its own counters, so limits are approximate. Swap the `Map` in `lib/server/ratelimit.ts` for Upstash Redis (free tier) for exact limits.
- Invoice extraction can take up to ~60 s; the route sets `maxDuration = 60` (check your plan's limit).

## Option B — one container/VM (Render, Fly.io, a VPS)
`npm ci && npx prisma generate && npm run build && npm start`, with the same environment variables. A single process keeps the in-memory rate limiter exact.

## Backups
- **Supabase free tier does not include point-in-time backups.** Take your own: a nightly `pg_dump "$DIRECT_URL" -Fc -f kooper-$(date +%F).dump` (cron, GitHub Actions schedule, or similar), stored somewhere other than the database host. Test a restore (`pg_restore`) on a scratch database before relying on it.
- The stock ledger is append-only, so a restored backup plus the ledger is enough to audit stock.

## Production checklist
- [ ] `AUTH_SECRET` is long, random and unique to production
- [ ] `APP_URL` is the real https URL (reset/invite links)
- [ ] Pooled `DATABASE_URL`; migrations applied with the direct URL
- [ ] `/api/health` is green
- [ ] Nightly backups running, restore tested
- [ ] Email configured (or you accept sharing invite links manually)
- [ ] Decide whether invoices may go to Gemini free tier (see README)
- [ ] Add error monitoring (e.g. Sentry free tier) — not included
