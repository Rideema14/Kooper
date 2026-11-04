import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as po from "@/lib/services/purchasing";
import { notFound } from "@/lib/server/errors";
import { requireCtx } from "@/lib/server/auth";
import { handleError } from "@/lib/server/errors";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/server/ratelimit";

type P = { id: string; action: string };
const caps = { approve: CAN.purchasing, reject: CAN.purchasing, cancel: CAN.purchasing, send: CAN.purchasing, payment: [...CAN.purchasing, "ACCOUNTANT"], receive: CAN.receiving } as const;

export async function POST(req: NextRequest, { params }: { params: P }) {
  try {
    const cap = caps[params.action as keyof typeof caps];
    if (!cap) throw notFound();
    const c = await requireCtx([...cap] as never);
    rateLimit(`po:${c.userId}`, 120, 60_000);
    switch (params.action) {
      case "approve": return NextResponse.json(plain(await po.approvePurchase(c, params.id)));
      case "reject": return NextResponse.json(plain(await po.rejectPurchase(c, params.id)));
      case "cancel": return NextResponse.json(plain(await po.cancelPurchase(c, params.id)));
      case "send": await json(req, S.poSend); return NextResponse.json(plain(await po.markSent(c, params.id)));
      case "payment": return NextResponse.json(await po.setPayment(c, params.id, (await json(req, S.poPayment)).paymentStatus).then(() => ({ ok: true })));
      default: return NextResponse.json(plain(await po.receivePurchase(c, params.id, await json(req, S.poReceive))));
    }
  } catch (e) { return handleError(e); }
}
