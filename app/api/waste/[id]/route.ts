import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as ws from "@/lib/services/waste";
export const DELETE = route<{ id: string }>(CAN.purchasing, async (c, _r, p) => ws.reverseWaste(c, p.id));
