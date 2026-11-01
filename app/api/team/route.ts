import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as acct from "@/lib/services/account";
export const GET = route(CAN.team, async (c) => plain(await acct.listTeam(c.restaurantId)));
export const POST = route(CAN.team, async (c, req) => { const b = await json(req, S.inviteSchema); return acct.createInvite(c, b.email, b.role); }, { limit: 20 });
