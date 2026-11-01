import { NextRequest, NextResponse } from "next/server";
import { handleError } from "@/lib/server/errors";
import { rateLimit, clientIp } from "@/lib/server/ratelimit";
import { json } from "@/lib/server/route";
import { createSession, destroySession } from "@/lib/server/auth";
import * as acct from "@/lib/services/account";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";

export async function POST() { destroySession(); return NextResponse.json({ ok: true }); }
