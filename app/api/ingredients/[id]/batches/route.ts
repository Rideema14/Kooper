import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as cat from "@/lib/services/catalog";
export const GET = route<{ id: string }>(CAN.inventoryRead, async (c, _r, p) => plain(await cat.listBatches(c, p.id)));
