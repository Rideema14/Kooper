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
    rateLimit(`forgot:${clientIp(req)}`, 5, 600_000);
    const r = await acct.forgotPassword((await json(req, S.forgotSchema)).email);
    // Same response whether or not the account exists. devLink only appears outside production when email isn't configured.
    return NextResponse.json({ ok: true, message: "If that email has an account, a reset link is on its way.", devLink: r.devLink });
  } catch (e) { return handleError(e); }
}
