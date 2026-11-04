import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as ws from "@/lib/services/waste";
import { NextResponse } from "next/server";
export const GET = route(CAN.waste, async (c, req) => { const u = new URL(req.url).searchParams; return plain(await ws.listWaste(c, u.get("from") ? new Date(u.get("from") as string) : undefined, u.get("to") ? new Date(u.get("to") as string) : undefined)); });
export const POST = route(CAN.waste, async (c, req) => NextResponse.json(plain(await ws.logWaste(c, await json(req, S.wasteSchema))), { status: 201 }));
