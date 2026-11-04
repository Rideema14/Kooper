import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as po from "@/lib/services/purchasing";
type P = { id: string };
export const GET = route<P>(CAN.inventoryRead, async (c, _r, p) => plain(await po.getPurchase(c, p.id)));
export const PATCH = route<P>(CAN.purchasing, async (c, req, p) => plain(await po.updatePurchase(c, p.id, await json(req, S.poUpdate))));
