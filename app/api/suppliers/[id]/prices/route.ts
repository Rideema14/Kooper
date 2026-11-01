import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as cat from "@/lib/services/catalog";
export const PUT = route<{ id: string }>(CAN.purchasing, async (c, req, p) => { const b = await json(req, S.supplierPriceSchema); return plain(await cat.setSupplierPrice(c, p.id, b.ingredientId, b.price)); });
