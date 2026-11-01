import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as cat from "@/lib/services/catalog";
export const POST = route<{ id: string }>(CAN.inventoryWrite, async (c, req, p) => plain(await cat.consume(c, p.id, await json(req, S.stockConsume))));
