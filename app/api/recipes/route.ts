import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as rc from "@/lib/services/recipes";
export const GET = route(CAN.inventoryRead, async (c) => plain(await rc.listRecipes(c)));
export const POST = route(CAN.recipes, async (c, req) => plain(await rc.saveRecipe(c, null, await json(req, S.recipeSchema))));
