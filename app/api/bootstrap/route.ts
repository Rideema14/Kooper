import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import { db } from "@/lib/server/db";
import * as acct from "@/lib/services/account";
import * as cat from "@/lib/services/catalog";
import * as po from "@/lib/services/purchasing";
import * as ws from "@/lib/services/waste";
import * as rc from "@/lib/services/recipes";
import * as rp from "@/lib/services/reports";
import * as nt from "@/lib/services/notifications";

/** One round trip for the whole app shell. Everything is scoped to the session's restaurant. */
export const GET = route(CAN.inventoryRead, async (c) => {
  await nt.syncNotifications(c.restaurantId);
  const since = new Date(Date.now() - 60 * 864e5);
  const [me, ingredients, purchases, waste, recipes, suppliers, dash, notifications] = await Promise.all([
    acct.me(c.userId, c.restaurantId), cat.listIngredients(c), po.listPurchases(c, ["PENDING_APPROVAL", "APPROVED", "SENT", "PARTIALLY_RECEIVED"]),
    ws.listWaste(c, since), rc.listRecipes(c), db.supplier.findMany({ where: { restaurantId: c.restaurantId, archivedAt: null }, orderBy: { name: "asc" } }),
    rp.dashboard(c, { from: new Date(Date.now() - 7 * 864e5) }), nt.listNotifications(c.restaurantId),
  ]);
  return plain({ me, ingredients, purchases, waste, recipes, suppliers, dash, notifications });
});
