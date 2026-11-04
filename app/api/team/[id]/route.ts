import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as acct from "@/lib/services/account";
type P = { id: string };
export const PATCH = route<P>(CAN.team, async (c, req, p) => acct.setRole(c, p.id, (await json(req, S.roleSchema)).role));
export const DELETE = route<P>(CAN.team, async (c, _r, p) => acct.removeMember(c, p.id));
