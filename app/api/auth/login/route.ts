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
    rateLimit(`login:${clientIp(req)}`, 10, 60_000);
    const b = await json(req, S.loginSchema);
    rateLimit(`login-acct:${b.email}`, 8, 300_000);
    const u = await acct.login(b.email, b.password);
    await createSession(u.id);
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
