import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as acct from "@/lib/services/account";
export const GET = route(CAN.inventoryRead, async (c) => plain(await acct.me(c.userId, c.restaurantId)));
