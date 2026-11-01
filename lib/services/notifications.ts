import type { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { D } from "@/lib/domain";

type Client = Prisma.TransactionClient | typeof db;

/** Idempotent via (restaurantId, dedupeKey): the same event never notifies twice. */
export async function notify(c: Client, restaurantId: string, n: { kind: string; title: string; body?: string; dedupeKey: string }) {
  await c.notification.upsert({
    where: { restaurantId_dedupeKey: { restaurantId, dedupeKey: n.dedupeKey } },
    create: { restaurantId, ...n }, update: {},
  });
}

const lastSync = new Map<string, number>();

/**
 * Derives alert notifications from live data (low stock, expiry, reviews, approvals).
 * Five parallel reads, then ONE bulk insert (duplicates skipped via the dedupeKey unique index).
 * Throttled per restaurant so page loads don't repeat the work.
 */
export async function syncNotifications(restaurantId: string, { force = false } = {}) {
  const now = Date.now();
  if (!force && now - (lastSync.get(restaurantId) ?? 0) < 60_000) return;
  lastSync.set(restaurantId, now);
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(now + 3 * 864e5);
  const [low, expiring, review, pending] = await Promise.all([
    db.$queryRaw<{ id: string; name: string; unit: string; onHand: string; reorderLevel: string }[]>`
      SELECT i."id", i."name", i."unit", COALESCE(SUM(b."quantity"), 0)::text AS "onHand", i."reorderLevel"::text AS "reorderLevel"
      FROM "Ingredient" i LEFT JOIN "InventoryItem" b ON b."ingredientId" = i."id"
      WHERE i."restaurantId" = ${restaurantId} AND i."archivedAt" IS NULL AND i."reorderLevel" > 0
      GROUP BY i."id" HAVING COALESCE(SUM(b."quantity"), 0) <= i."reorderLevel"`,
    db.inventoryItem.findMany({ where: { restaurantId, quantity: { gt: 0 }, expiryDate: { lte: soon } }, include: { ingredient: { select: { name: true, unit: true } } } }),
    db.invoice.count({ where: { restaurantId, status: "NEEDS_REVIEW" } }),
    db.purchaseOrder.count({ where: { restaurantId, status: "PENDING_APPROVAL" } }),
  ]);
  const rows: { restaurantId: string; kind: string; title: string; body?: string; dedupeKey: string }[] = [];
  for (const i of low) rows.push({ restaurantId, kind: "low_stock", title: `${i.name} is low`, body: `${D(i.onHand).toString()} ${i.unit} left (reorder at ${D(i.reorderLevel).toString()}).`, dedupeKey: `low:${i.id}:${today}` });
  for (const b of expiring) {
    const days = Math.ceil(((b.expiryDate as Date).getTime() - now) / 864e5);
    rows.push({ restaurantId, kind: "expiry", title: `${b.ingredient.name} ${days < 0 ? "has expired" : days === 0 ? "expires today" : `expires in ${days} day${days > 1 ? "s" : ""}`}`, body: `${b.quantity.toString()} ${b.ingredient.unit}${b.batchCode ? ` · batch ${b.batchCode}` : ""}`, dedupeKey: `exp:${b.id}:${today}` });
  }
  if (review) rows.push({ restaurantId, kind: "invoice_review", title: `${review} invoice${review > 1 ? "s" : ""} need review`, dedupeKey: `inv:${review}:${today}` });
  if (pending) rows.push({ restaurantId, kind: "po_approval", title: `${pending} order${pending > 1 ? "s" : ""} waiting for approval`, dedupeKey: `poa:${pending}:${today}` });
  if (rows.length) await db.notification.createMany({ data: rows, skipDuplicates: true });
}

export const listNotifications = (restaurantId: string) =>
  db.notification.findMany({ where: { restaurantId }, orderBy: { createdAt: "desc" }, take: 50 });
export const markRead = (restaurantId: string, ids?: string[]) =>
  db.notification.updateMany({ where: { restaurantId, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
