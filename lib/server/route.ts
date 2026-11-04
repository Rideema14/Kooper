import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { requireCtx, type Ctx } from "./auth";
import { handleError } from "./errors";
import { rateLimit } from "./ratelimit";

type Handler<P> = (ctx: Ctx, req: NextRequest, params: P) => Promise<unknown>;

/** Auth + RBAC + rate limit + central error handling for every private API route. */
export function route<P = Record<string, string>>(allowed: readonly Role[] | undefined, fn: Handler<P>, opts: { limit?: number } = {}) {
  return async (req: NextRequest, { params }: { params: P }) => {
    try {
      const ctx = await requireCtx(allowed ? [...allowed] : undefined);
      rateLimit(`api:${ctx.userId}`, opts.limit ?? 240, 60_000);
      const out = await fn(ctx, req, params);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) { return handleError(e); }
  };
}

export async function json<T>(req: NextRequest, schema: { parse: (v: unknown) => T }): Promise<T> {
  const body = await req.json().catch(() => ({}));
  return schema.parse(body);
}

/** Decimal/Date-safe JSON for the browser. */
export function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (x && typeof x === "object" && "toFixed" in x && "d" in x ? Number(x.toString()) : x)));
}
