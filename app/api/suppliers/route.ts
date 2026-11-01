import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as cat from "@/lib/services/catalog";
export const GET = route(CAN.inventoryRead, async (c) => plain(await cat.listSuppliers(c)));
export const POST = route(CAN.purchasing, async (c, req) => plain(await cat.createSupplier(c, await json(req, S.supplierSchema))));
