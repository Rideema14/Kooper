/**
 * Demo data for local development. Never run against a real restaurant's database.
 *   npm run db:seed
 * Creates demo@kooper.dev / $SEED_PASSWORD (default below) owning "Olive & Oak Bistro".
 */
import { db } from "../lib/server/db";
import { hashPassword } from "../lib/server/auth";
import { addIngredient } from "../lib/services/catalog";
import { createPurchase, approvePurchase, markSent, receivePurchase } from "../lib/services/purchasing";
import { saveRecipe } from "../lib/services/recipes";
import { logWaste } from "../lib/services/waste";

const EMAIL = "demo@kooper.dev";
const PASSWORD = process.env.SEED_PASSWORD || "kooper-demo-1234";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  const existing = await db.user.findUnique({ where: { email: EMAIL } });
  if (existing) { console.log(`Demo user already exists (${EMAIL}). Nothing to do.`); return; }

  const user = await db.user.create({ data: { email: EMAIL, name: "Olivia Marsh", passwordHash: await hashPassword(PASSWORD) } });
  const r = await db.restaurant.create({ data: { name: "Olive & Oak Bistro" } });
  await db.membership.create({ data: { userId: user.id, restaurantId: r.id, role: "OWNER" } });
  const ctx = { restaurantId: r.id, userId: user.id };

  const sup = Object.fromEntries(await Promise.all(["Fresh Farms", "Dairy Direct", "Spice Route", "Ocean Catch"].map(async (name) => [name, await db.supplier.create({ data: { restaurantId: r.id, name, phone: "+91 90000 00000" } })])));
  const soon = (d: number) => new Date(Date.now() + d * 864e5);
  const rows: [string, string, string, number, number, number, number, string, Date?][] = [
    // name, category, unit, onHand, reorderAt, unitCost, … supplier
    ["Tomatoes", "Produce", "kg", 4, 8, 34, 0, "Fresh Farms", soon(4)],
    ["Basil", "Produce", "kg", 0.5, 0.5, 220, 0, "Fresh Farms", soon(2)],
    ["Lettuce", "Produce", "kg", 6, 3, 60, 0, "Fresh Farms", soon(5)],
    ["Mozzarella", "Dairy", "kg", 5, 3, 420, 0, "Dairy Direct", soon(9)],
    ["Parmesan", "Dairy", "kg", 1.2, 2, 980, 0, "Dairy Direct", soon(40)],
    ["Cream", "Dairy", "L", 6, 4, 180, 0, "Dairy Direct", soon(6)],
    ["Flour", "Pantry", "kg", 25, 10, 48, 0, "Spice Route"],
    ["Olive oil", "Pantry", "L", 9, 4, 620, 0, "Spice Route"],
    ["Black pepper", "Pantry", "kg", 0.8, 0.5, 780, 0, "Spice Route"],
    ["Salmon", "Seafood", "kg", 3, 4, 1150, 0, "Ocean Catch", soon(2)],
  ];
  const ing: Record<string, string> = {};
  for (const [name, category, unit, qty, reorder, cost, , s, exp] of rows)
    ing[name] = (await addIngredient(ctx, { name, category, unit, unitCost: cost, reorderLevel: reorder, minStock: reorder, supplierId: sup[s].id, openingStock: qty, expiryDate: exp ?? null })).id;

  for (const [s, i, p] of [["Fresh Farms", "Tomatoes", 34], ["Dairy Direct", "Mozzarella", 420], ["Dairy Direct", "Parmesan", 980], ["Spice Route", "Olive oil", 620], ["Ocean Catch", "Salmon", 1150]] as const)
    await db.supplierPrice.create({ data: { restaurantId: r.id, supplierId: sup[s].id, ingredientId: ing[i], price: p } });

  await saveRecipe(ctx, null, { name: "Margherita pizza", servings: 1, sellingPrice: 299, lines: [{ ingredientId: ing["Flour"], quantity: 0.18 }, { ingredientId: ing["Tomatoes"], quantity: 0.12 }, { ingredientId: ing["Mozzarella"], quantity: 0.15 }, { ingredientId: ing["Basil"], quantity: 0.01 }, { ingredientId: ing["Olive oil"], quantity: 0.02 }] });
  await saveRecipe(ctx, null, { name: "Grilled salmon", servings: 1, sellingPrice: 749, lines: [{ ingredientId: ing["Salmon"], quantity: 0.2 }, { ingredientId: ing["Cream"], quantity: 0.05 }, { ingredientId: ing["Black pepper"], quantity: 0.002 }] });

  // One delivered order so reports have a spend history, one waiting for approval.
  const done = await createPurchase(ctx, { supplierId: sup["Dairy Direct"].id, items: [{ ingredientId: ing["Cream"], quantity: 4 }], notes: "Seed order" });
  await approvePurchase(ctx, done.id); await markSent(ctx, done.id);
  await receivePurchase(ctx, done.id, { lines: [{ itemId: done.items[0].id, quantity: 4 }], idempotencyKey: "seed" });
  await createPurchase(ctx, { supplierId: sup["Fresh Farms"].id, items: [{ ingredientId: ing["Tomatoes"], quantity: 12 }, { ingredientId: ing["Basil"], quantity: 1 }] });

  for (const [i, q, why] of [["Lettuce", 0.6, "Spoiled"], ["Tomatoes", 0.4, "Prep waste"], ["Lettuce", 0.5, "Spoiled"]] as const)
    await logWaste(ctx, { ingredientId: ing[i], quantity: q, reason: why, department: "Kitchen" });

  console.log(`Seeded. Sign in with ${EMAIL} / ${PASSWORD}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
