# Kooper — restaurant operations

Inventory with a real stock ledger, purchasing with approvals, supplier invoices read and checked before anything changes, recipe costing, waste tracking, reports and an assistant that answers from your own records.

Next.js 14 · React · TypeScript · PostgreSQL · Prisma 6 · Zod · Vitest · Playwright · Three.js (the scene on the home screen).

## Quick start (local)

Requirements: Node 20+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET (openssl rand -base64 32)

# create the database, then apply migrations
createdb kooper
for f in prisma/migrations/*/migration.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
#   …or, with internet access to Prisma's engines:  npx prisma migrate deploy

npx prisma generate
npm run db:seed               # optional demo restaurant: demo@kooper.dev / kooper-demo-1234
npm run dev                   # http://localhost:3000  (slow first loads: compiles each page on demand)
# For speed, build once and run the optimised app instead:
npm run serve                 # next build && next start — pages open in well under a second
```

Verify the migrations match the schema before first deploy (zero drift expected):

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

## What's in it

| Area | What works |
|---|---|
| Accounts | Signup (creates a restaurant and its owner), login/logout, password reset (single-use link), team invitations (7-day link), roles: Owner, Manager, Chef, Inventory staff, Accountant |
| Isolation | The restaurant is always resolved from the signed session + membership. Request bodies/URLs can't choose it. Every query is scoped by it. |
| Stock | Ingredients (create/edit/archive), batches with expiry, receiving, consumption, counts/adjustments. Every change is an append-only ledger row; stock is never overwritten. FIFO by earliest expiry. Row-locked transactions; idempotency keys stop double deduction. |
| Purchasing | Low-stock suggestions (cheapest known supplier), drafts, approve/reject, **"I placed this order" requires explicit confirmation** (Kooper never contacts suppliers), partial deliveries, ordered-vs-received, price variance alerts, payment status, printable PO, supplier price lists |
| Invoices | Upload PDF/JPEG/PNG (Gemini) or CSV/XLSX (parsed locally). Content-sniffed, ≤10 MB, duplicate-file and duplicate-number detection, ingredient matching, arithmetic checks, manual correction, **nothing touches prices or stock until a person approves**; adding to stock is a separate explicit tick |
| Recipes | Database-backed; cost follows current ingredient prices; food-cost %, gross profit, price history |
| Waste | Logs reason/department/value, deducts FIFO in the same transaction, reversible, repeated-waste detection |
| Reports | Date-ranged dashboard computed from records (valuation, spend, waste, price trends, supplier fulfilment, invoice status, profitability). CSV, Excel and PDF export |
| Notifications | In-app: low stock, expiry (3 days), invoices to review, orders to approve, deliveries, price changes. Email via Resend if configured |
| Ask Kooper | Reads facts from the database server-side. Gemini phrases the answer if configured; otherwise "basic mode" answers deterministically. It cannot change anything. Rate-limited. |

## External services and credentials

| Service | Needed for | If missing |
|---|---|---|
| PostgreSQL (e.g. Supabase free tier) | everything | app won't start |
| `AUTH_SECRET` | sessions | app won't start |
| `GEMINI_API_KEY` | PDF/photo invoice reading; AI phrasing in Ask Kooper | PDF/photo upload returns a clear "needs Gemini key" message; Ask Kooper uses basic mode. CSV/XLSX unaffected |
| `RESEND_API_KEY` + `RESEND_FROM` | emails | reset/invite links are returned to the owner (reset link only outside production) |

**Gemini data use:** on the free tier, Google may use submitted content to improve its products. Don't send invoices you consider confidential on the free tier; use a paid/Cloud project, or stick to CSV/XLSX (never sent anywhere).

## Tests

```bash
npm run typecheck
npm run lint
npm test                      # Vitest: unit + integration against a real Postgres (TEST_DATABASE_URL)
npm run test:e2e              # Playwright (needs: npx playwright install chromium, a seeded DB)
```

Create the test database once and apply the migrations to it (same loop as above, with `TEST_DATABASE_URL`).

## Project layout

```
app/                 pages + API routes (thin: auth → validate → service)
  api/…              route handlers, all wrapped by lib/server/route.ts
components/          the existing Kooper UI (views, modals, Three.js scene)
lib/domain.ts        pure calculations (costing, FIFO, invoice validation)
lib/services/        business logic; one DB transaction per operation
lib/server/          env, db, auth/RBAC, errors, rate limit, email, tokens
lib/schemas.ts       Zod schemas for every request body
prisma/              schema, migrations, seed
tests/               unit, integration, e2e
```

See `DEPLOYMENT.md` for hosting and backups, and `PROJECT_PROGRESS.md` for an honest status report.

## The 3D scene

Each screen has its own object on a walnut table: Stock = tomato crate, Costing = Margherita on a board, Orders/Invoices = supplier invoice and pen, Assistant = phone, Waste = steel bowl of scraps, Reports = open ledger. The objects are decorative; they don't display your data. Depth of field (BokehPass) is on for desktop and turns itself off if frames slow down. Add `?nodof` to the URL to disable it, or `?nogl` to skip the scene entirely (the tests do this).

## Speed notes

How the app opens quickly (and what to check if it ever doesn't):

1. **Data starts loading before the JavaScript does.** `app/layout.tsx` fires the data request the moment the page HTML arrives; `lib/store.ts` picks it up once the app has loaded.
2. **One database round trip.** `/api/bootstrap` runs all its queries in parallel; the membership check (who may see this restaurant) runs inside that same wave, and nothing is returned unless it passes. Notification syncing runs in the background.
3. **Screens switch instantly.** Tapping a screen mounts it on the next frame with a short fade; the camera glides to the new 3D object at the same time. Nothing blocks input.
4. **The 3D table never delays loading.** It starts only after your data is on screen and the browser is idle, stops drawing while the page card covers it, lowers its own quality when frames drop, and switches itself off (and remembers that) if the device still can't keep up. Control it in Settings, or with `?gl` / `?nogl` in the address.
5. **Updates feel instant.** Stock +/- changes on screen immediately; saves reload the data in the background.

Things outside the code that matter more than anything above:
- **Run `npm run build && npm start` (or `npm run serve`) when judging speed.** `npm run dev` compiles each page on first visit and can take minutes.
- **Put the app in the same region as the database.** `vercel.json` pins functions to London (`lhr1`) to match a London Neon database; change it if your database is elsewhere. Each query costs one network round trip to the database.
- **Free-tier databases sleep.** Neon pauses idle free databases; the first request afterwards can take a couple of seconds.
- Open the browser's Network tab → `bootstrap` → Timing: the `Server-Timing` header shows how long authentication and data took on the server.
