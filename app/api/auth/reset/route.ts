import { NextRequest, NextResponse } from "next/server";
import { handleError } from "@/lib/server/errors";
import { rateLimit, clientIp } from "@/lib/server/ratelimit";
import { json } from "@/lib/server/route";
import { createSession, destroySession } from "@/lib/server/auth";
import * as acct from "@/lib/services/account";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    rateLimit(`reset:${clientIp(req)}`, 10, 600_000);
    const b = await json(req, S.resetSchema);
    await acct.resetPassword(b.token, b.password);
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
