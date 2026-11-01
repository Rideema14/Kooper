import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as po from "@/lib/services/purchasing";
export const POST = route(CAN.purchasing, async (c) => plain(await po.draftFromSuggestions(c)));
