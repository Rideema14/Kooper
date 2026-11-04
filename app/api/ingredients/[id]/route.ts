import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as cat from "@/lib/services/catalog";
type P = { id: string };
export const PATCH = route<P>(CAN.inventoryWrite, async (c, req, p) => plain(await cat.patchIngredient(c, p.id, await json(req, S.ingredientPatch))));
export const DELETE = route<P>(CAN.inventoryWrite, async (c, _r, p) => cat.archiveIngredient(c, p.id));
