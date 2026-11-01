import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as nt from "@/lib/services/notifications";
import { z } from "zod";
export const GET = route(CAN.inventoryRead, async (c) => { await nt.syncNotifications(c.restaurantId); return plain(await nt.listNotifications(c.restaurantId)); });
export const POST = route(CAN.inventoryRead, async (c, req) => { const b = await json(req, z.object({ ids: z.array(z.string()).optional() })); await nt.markRead(c.restaurantId, b.ids); });
