import type { Prisma } from "@prisma/client";
import { db } from "./db";

type Client = Prisma.TransactionClient | typeof db;
export async function audit(c: Client, ctx: { restaurantId: string; userId?: string | null }, action: string, entity: string, entityId?: string | null, meta?: Prisma.InputJsonValue) {
  await c.auditLog.create({ data: { restaurantId: ctx.restaurantId, userId: ctx.userId ?? null, action, entity, entityId: entityId ?? null, meta } });
}
