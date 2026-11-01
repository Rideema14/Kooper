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

/** Derives alert notifications from live data (low stock, expiry, reviews, approvals). Safe to call repeatedly. */
export async function syncNotifications(restaurantId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 3 * 864e5);
  const [ings, sums, expiring, review, pending] = await Promise.all([
    db.ingredient.findMany({ where: { restaurantId, archivedAt: null } }),
    db.inventoryItem.groupBy({ by: ["ingredientId"], where: { restaurantId }, _sum: { quantity: true } }),
    db.inventoryItem.findMany({ where: { restaurantId, quantity: { gt: 0 }, expiryDate: { lte: soon } }, include: { ingredient: true } }),
    db.invoice.count({ where: { restaurantId, status: "NEEDS_REVIEW" } }),
    db.purchaseOrder.count({ where: { restaurantId, status: "PENDING_APPROVAL" } }),
  ]);
  const have = new Map(sums.map((s) => [s.ingredientId, D(s._sum.quantity ?? 0)]));
  for (const i of ings) {
    const q = have.get(i.id) ?? D(0);
    if (q.lte(i.reorderLevel) && i.reorderLevel.gt(0))
      await notify(db, restaurantId, { kind: "low_stock", title: `${i.name} is low`, body: `${q.toString()} ${i.unit} left (reorder at ${i.reorderLevel.toString()}).`, dedupeKey: `low:${i.id}:${today}` });
  }
  for (const b of expiring) {
    const days = Math.ceil(((b.expiryDate as Date).getTime() - Date.now()) / 864e5);
    await notify(db, restaurantId, { kind: "expiry", title: `${b.ingredient.name} ${days < 0 ? "has expired" : days === 0 ? "expires today" : `expires in ${days} day${days > 1 ? "s" : ""}`}`, body: `${b.quantity.toString()} ${b.ingredient.unit}${b.batchCode ? ` · batch ${b.batchCode}` : ""}`, dedupeKey: `exp:${b.id}:${today}` });
  }
  if (review) await notify(db, restaurantId, { kind: "invoice_review", title: `${review} invoice${review > 1 ? "s" : ""} need review`, dedupeKey: `inv:${review}:${today}` });
  if (pending) await notify(db, restaurantId, { kind: "po_approval", title: `${pending} order${pending > 1 ? "s" : ""} waiting for approval`, dedupeKey: `poa:${pending}:${today}` });
}

export const listNotifications = (restaurantId: string) =>
  db.notification.findMany({ where: { restaurantId }, orderBy: { createdAt: "desc" }, take: 50 });
export const markRead = (restaurantId: string, ids?: string[]) =>
  db.notification.updateMany({ where: { restaurantId, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
