import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as rc from "@/lib/services/recipes";
export const GET = route<{ id: string }>(CAN.recipes, async (c, _r, p) => plain(await rc.priceHistory(c, p.id)));
