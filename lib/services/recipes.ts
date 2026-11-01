import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { conflict, notFound } from "@/lib/server/errors";
import { D, recipeCost, recipeMetrics } from "@/lib/domain";
import { inTx } from "./stock";
import type { z } from "zod";
import type { recipeSchema } from "@/lib/schemas";

type Ctx = { restaurantId: string; userId: string };
const include = { lines: { include: { ingredient: { select: { id: true, name: true, unit: true, unitCost: true } } } } } as const;

/** Costs always read the ingredient's current (approved) unit cost — never a stored copy. */
function withMetrics<T extends { sellingPrice: unknown; servings: number; lines: { quantity: unknown; ingredient: { unitCost: unknown } }[] }>(r: T) {
  const cost = recipeCost(r.lines.map((l) => ({ quantity: l.quantity as never, unitCost: l.ingredient.unitCost as never })));
  const m = recipeMetrics(cost, r.sellingPrice as never);
  return { ...r, cost: m.cost.toDecimalPlaces(2), grossProfit: m.gross.toDecimalPlaces(2), foodCostPct: m.foodCostPct.toDecimalPlaces(1) };
}

export async function listRecipes(ctx: Ctx) {
  const rs = await db.recipe.findMany({ where: { restaurantId: ctx.restaurantId, archivedAt: null }, include, orderBy: { name: "asc" } });
  return rs.map(withMetrics);
}

export async function saveRecipe(ctx: Ctx, id: string | null, p: z.infer<typeof recipeSchema>) {
  return inTx(async (tx) => {
    const ids = [...new Set(p.lines.map((l) => l.ingredientId))];
    if (ids.length !== p.lines.length) throw conflict("Each ingredient can appear once per recipe.");
    const found = await tx.ingredient.count({ where: { id: { in: ids }, restaurantId: ctx.restaurantId } });
    if (found !== ids.length) throw notFound("One of the ingredients wasn't found.");
    let recipeId = id;
    if (id) {
      const cur = await tx.recipe.findFirst({ where: { id, restaurantId: ctx.restaurantId } });
      if (!cur) throw notFound("Recipe not found.");
      if (!cur.sellingPrice.equals(D(p.sellingPrice))) await audit(tx, ctx, "recipe.price", "Recipe", id, { from: cur.sellingPrice.toString(), to: String(p.sellingPrice) });
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
      await tx.recipe.update({ where: { id }, data: { name: p.name, servings: p.servings, sellingPrice: p.sellingPrice } });
    } else {
      const r = await tx.recipe.create({ data: { restaurantId: ctx.restaurantId, name: p.name, servings: p.servings, sellingPrice: p.sellingPrice } });
      recipeId = r.id;
      await audit(tx, ctx, "recipe.price", "Recipe", r.id, { from: null, to: String(p.sellingPrice) });
    }
    await tx.recipeIngredient.createMany({ data: p.lines.map((l) => ({ recipeId: recipeId as string, ingredientId: l.ingredientId, quantity: D(l.quantity) })) });
    await audit(tx, ctx, id ? "recipe.update" : "recipe.create", "Recipe", recipeId);
    return withMetrics(await tx.recipe.findFirstOrThrow({ where: { id: recipeId as string }, include }));
  }).catch((e) => { if ((e as { code?: string }).code === "P2002") throw conflict("A recipe with that name already exists."); throw e; });
}

export async function archiveRecipe(ctx: Ctx, id: string) {
  const r = await db.recipe.updateMany({ where: { id, restaurantId: ctx.restaurantId }, data: { archivedAt: new Date() } });
  if (!r.count) throw notFound("Recipe not found.");
  await audit(db, ctx, "recipe.archive", "Recipe", id);
}

export const priceHistory = (ctx: Ctx, id: string) =>
  db.auditLog.findMany({ where: { restaurantId: ctx.restaurantId, entity: "Recipe", entityId: id, action: "recipe.price" }, orderBy: { createdAt: "desc" }, take: 50 });
