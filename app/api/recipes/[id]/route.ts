import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as rc from "@/lib/services/recipes";
type P = { id: string };
export const PUT = route<P>(CAN.recipes, async (c, req, p) => plain(await rc.saveRecipe(c, p.id, await json(req, S.recipeSchema))));
export const DELETE = route<P>(CAN.recipes, async (c, _r, p) => rc.archiveRecipe(c, p.id));
