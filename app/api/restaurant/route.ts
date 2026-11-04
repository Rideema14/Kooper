import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
export const PATCH = route(CAN.team, async (c, req) => {
  const b = await json(req, S.restaurantSchema);
  await db.restaurant.update({ where: { id: c.restaurantId }, data: { name: b.name } });
  await audit(db, c, "restaurant.update", "Restaurant", c.restaurantId, b);
});
