import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as cat from "@/lib/services/catalog";
type P = { id: string };
export const PATCH = route<P>(CAN.purchasing, async (c, req, p) => cat.updateSupplier(c, p.id, await json(req, S.supplierSchema)));
export const DELETE = route<P>(CAN.purchasing, async (c, _r, p) => cat.archiveSupplier(c, p.id));
