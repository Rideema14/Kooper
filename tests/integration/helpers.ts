import { db } from "@/lib/server/db";

let n = 0;
/** Creates an isolated restaurant (tenant) for a test. */
export async function makeRestaurant(label = "T") {
  const r = await db.restaurant.create({ data: { name: `${label}-${Date.now()}-${n++}` } });
  return { restaurantId: r.id, userId: null as string | null };
}
export const cleanup = async () => {
  // Children that RESTRICT ingredient deletion go first, then the restaurants cascade.
  const where = { restaurant: { name: { contains: "-" } } };
  await db.purchaseOrder.deleteMany({ where });
  await db.recipe.deleteMany({ where });
  await db.wasteEntry.deleteMany({ where });
  await db.restaurant.deleteMany({ where: { name: { contains: "-" } } });
};

import { hashPassword } from "@/lib/server/auth";
/** A real user + restaurant + membership, so audit-log foreign keys are satisfied. */
export async function makeCtx(label = "T", role: "OWNER" | "MANAGER" | "CHEF" | "INVENTORY_STAFF" | "ACCOUNTANT" = "OWNER") {
  const r = await db.restaurant.create({ data: { name: `${label}-${Date.now()}-${n++}` } });
  const u = await db.user.create({ data: { email: `${label.toLowerCase()}-${Date.now()}-${n++}@test.dev`, name: label, passwordHash: await hashPassword("password-1234") } });
  await db.membership.create({ data: { userId: u.id, restaurantId: r.id, role } });
  return { restaurantId: r.id, userId: u.id };
}
export const cleanupUsers = async () => { await db.user.deleteMany({ where: { email: { endsWith: "@test.dev" } } }); };
