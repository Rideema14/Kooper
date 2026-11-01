import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import { rateLimit } from "@/lib/server/ratelimit";
import * as asst from "@/lib/services/assistant";
export const maxDuration = 30;
export const POST = route(CAN.inventoryRead, async (c, req) => {
  rateLimit(`ai:${c.userId}`, 15, 60_000); // Gemini free tier
  const b = await json(req, S.assistantSchema);
  return asst.ask(c, b.message, b.history);
}, { limit: 100 });
