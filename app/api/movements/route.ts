import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as cat from "@/lib/services/catalog";
export const GET = route(CAN.inventoryRead, async (c, req) => { const u = new URL(req.url).searchParams; return plain(await cat.movements(c, u.get("ingredientId") ?? undefined, Number(u.get("take") ?? 100))); });
