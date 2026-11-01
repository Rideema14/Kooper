# Kooper — status report (honest)

_Updated 2026-11-01. Verified = I ran it in this sandbox. "Written, not run" = code exists but nothing here executed it._

## Verification summary
| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ clean |
| `next lint` | ✅ no warnings/errors |
| Vitest (unit + integration vs real PostgreSQL 16) | ✅ 53/53 |
| `next build` (production) | ✅ compiles, all routes generated |
| Production server smoke test over real HTTP (curl) | ✅ login, sessions, cross-tenant 404, PO workflow, explicit-confirm, partial receive, CSV invoice upload → approve, duplicate/spoofed/PDF-without-key rejections, CSV/XLSX/PDF export, assistant, rate-limit 429, security headers |
| Playwright E2E | ⚠️ **written, never run** — no browser can be installed in this sandbox. Selectors were checked against the source, not against a rendered page. Expect some fixes on first run. |
| **The redesigned screens in a real browser** | ⚠️ **never rendered.** I rewired every view to the API and it compiles and the API behind it works, but I have not seen the UI. Layout/visual regressions, mobile layout and the Three.js scene with real data are unchecked. Please click through every screen once. |
| Deployment | ❌ not attempted |

## Done
- **Database**: 17 models (the 16 requested + SupplierPrice), FKs, uniques, indexes, Decimal money; 2 migrations (hand-written SQL — Prisma's schema engine can't download here; applied and exercised against real Postgres; run the drift check in README on your machine).
- **Auth/RBAC**: signup, login, logout, single-use password reset, invitations, role changes/removal, restaurant rename; signed httpOnly cookie sessions; bcrypt (cost 12); restaurant always derived from session membership; login rate limits (per IP and per account).
- **Stock ledger**: append-only movements, FIFO by expiry, `SELECT … FOR UPDATE`, serialisable transactions, idempotency keys, concurrency test (never oversells).
- **Purchasing**: suggestions, drafts (one per supplier), approve/reject/cancel, explicit "placed with supplier" confirmation, partial receiving with batch/expiry, over-receipt blocked, price-change alerts, printable PO, supplier price lists.
- **Invoices**: PDF/JPEG/PNG via Gemini; CSV/XLSX parsed locally; magic-byte file validation, 10 MB cap, duplicate file + duplicate number detection, ingredient matching, arithmetic validation, manual correction UI, approval gate, optional add-to-stock.
- **Recipes**, **waste** (FIFO, reversal, repeat detection), **reports/exports**, **notifications**, **Ask Kooper** (server-side facts, Gemini optional, basic-mode fallback labelled as such).
- Security headers/CSP, Zod validation on every body, central error handling (no internals leaked), audit log writes, env validation, `.env` git-ignored.

## Not done / partial (read this)
1. **No local OCR** (Tesseract/PaddleOCR). Photos/PDFs go to Gemini only. Without a key they're refused with a clear message.
2. **No file storage** (R2 or otherwise). Uploaded invoice files are *not* kept — only a SHA-256 hash and the extracted data. You can't re-open the original image.
3. **Auth.js not used** — custom session code instead (deliberate; say if you want Auth.js).
4. **API-only, no screen yet**: supplier management and supplier price lists, editing a draft PO, payment status (PO + invoice), audit-log viewer, recipe archive restore, batch list per ingredient (UI shows next expiry only), setting max stock.
5. **Kitchen consumption** has an API but no dedicated screen; the ± stepper in Stock posts an ADJUSTMENT. Recipes do not auto-deduct stock when a dish is sold.
6. Waste reversal is limited to Owner/Manager.
7. Rate limiter is in-memory (approximate on serverless; see DEPLOYMENT.md).
8. Invite/reset emails only send if Resend is configured; otherwise links are shown/returned. Never simulated.
9. No error monitoring, no WhatsApp, no automated backups (instructions only), no CSRF tokens beyond `SameSite=Lax` cookies + JSON bodies.
10. "Supplier performance" is basic (orders, % fully delivered, value) — no on-time metric.
11. PDF report is a plain text summary, not a designed document.
12. The old "reset demo data" action was removed from Settings (no browser-side data left to reset).
13. Recipe line prices come from the ingredient's current cost (read-only in the UI) — by design so costs follow approved prices.

## Needs your credentials
`DATABASE_URL` (Supabase or any Postgres), `AUTH_SECRET`; optional `GEMINI_API_KEY`, `RESEND_API_KEY` + `RESEND_FROM`.

## Suggested next steps
1. Run the app, click every screen on desktop and phone, report visual issues.
2. `npx playwright install chromium && npm run test:e2e`; fix what fails.
3. Supplier management screen + PO edit + payment status UI.
4. Deploy to a staging environment; set up backups; add Sentry.

## Performance pass (2026-11-01)
Measured through a simulated 140 ms database round trip (local Postgres behind a delaying TCP proxy), production build:
- `/api/bootstrap`: **5.2 s → ~0.47 s** (first call after start ~1.3 s while connections open). Cause: ~35 sequential round trips, a full dashboard computed for two numbers, per-row notification upserts, a 5-connection pool queueing queries.
- Fixes: lightweight shell stats, bulk throttled background notification sync, single-query account lookup, joined relation loading (`relationJoins` preview), pool 5 → 10.
- Intro screen no longer waits for the 3D scene; opens on data-ready, ~1 s total, skipped on repeat visits.
- **Not measured:** real Neon/London latency, a real browser, the 3D scene's own load/GPU time, or the first-load cost of Next's dev server on your machine.
