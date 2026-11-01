import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import type { PurchaseStatus } from "@prisma/client";
import * as po from "@/lib/services/purchasing";
export const GET = route(CAN.inventoryRead, async (c, req) => { const s = new URL(req.url).searchParams.get("status"); return plain(await po.listPurchases(c, s ? (s.split(",") as PurchaseStatus[]) : undefined)); });
export const POST = route(CAN.purchasing, async (c, req) => plain(await po.createPurchase(c, await json(req, S.poCreate))));
