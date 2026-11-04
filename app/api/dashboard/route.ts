import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as rp from "@/lib/services/reports";
export const GET = route(CAN.inventoryRead, async (c, req) => { const u = new URL(req.url).searchParams; const r = S.range.parse({ from: u.get("from") ?? undefined, to: u.get("to") ?? undefined }); return plain(await rp.dashboard(c, r)); });
