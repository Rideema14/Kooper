import { db } from "@/lib/server/db";
import { CAN } from "@/lib/server/auth";
import { forbidden } from "@/lib/server/errors";
import { plain } from "@/lib/server/route";
import * as acct from "./account";
import * as cat from "./catalog";
import * as po from "./purchasing";
import * as ws from "./waste";
import * as rc from "./recipes";
import * as rp from "./reports";
import * as nt from "./notifications";

/**
 * Everything the app shell needs, fetched in ONE parallel wave (≈ one database round trip).
 * `acct.me` reads the user's Membership for this restaurant, so it is also the authorisation check:
 * if the user isn't a member (or their role can't read), nothing from the other queries is returned.
 */
export async function loadBootstrap(ctx: { userId: string; restaurantId: string }) {
  nt.syncNotifications(ctx.restaurantId).catch((e) => console.error("[notifications] sync failed:", e)); // background
  const since = new Date(Date.now() - 60 * 864e5);
  const [me, ingredients, purchases, waste, recipes, suppliers, dash, notifications] = await Promise.all([
    acct.me(ctx.userId, ctx.restaurantId).catch(() => { throw forbidden("Your account isn't linked to this restaurant."); }),
    cat.listIngredients(ctx), po.listPurchases(ctx, ["PENDING_APPROVAL", "APPROVED", "SENT", "PARTIALLY_RECEIVED"]),
    ws.listWaste(ctx, since), rc.listRecipes(ctx),
    db.supplier.findMany({ where: { restaurantId: ctx.restaurantId, archivedAt: null }, orderBy: { name: "asc" } }),
    rp.shellStats(ctx), nt.listNotifications(ctx.restaurantId),
  ]);
  if (!(CAN.inventoryRead as readonly string[]).includes(me.role)) throw forbidden();
  return plain({ me, ingredients, purchases, waste, recipes, suppliers, dash, notifications });
}
