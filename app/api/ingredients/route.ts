import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as cat from "@/lib/services/catalog";
export const GET = route(CAN.inventoryRead, async (c) => plain(await cat.listIngredients(c)));
export const POST = route(CAN.inventoryWrite, async (c, req) => plain(await cat.addIngredient(c, await json(req, S.ingredientCreate))));
