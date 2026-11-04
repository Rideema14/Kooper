import { NextResponse } from "next/server";
import { CAN, peekSession, requireCtx } from "@/lib/server/auth";
import { handleError, unauthorized } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";
import { loadBootstrap } from "@/lib/services/bootstrap";
export const dynamic = "force-dynamic";

/**
 * Fast path: the signed session already names the restaurant, so data loading starts immediately and the
 * membership check runs inside the same parallel wave (see loadBootstrap). Sessions issued before this change
 * have no restaurant hint and take the slower, equivalent path through requireCtx.
 */
export async function GET() {
  try {
    const t0 = performance.now();
    const s = await peekSession();
    if (!s) throw unauthorized();
    rateLimit(`api:${s.uid}`, 240, 60_000);
    const ctx = s.rid ? { userId: s.uid, restaurantId: s.rid } : await requireCtx([...CAN.inventoryRead]);
    const t1 = performance.now();
    const data = await loadBootstrap(ctx);
    const t2 = performance.now();
    // Server-Timing is a standard header shown in the browser's Network tab → "Timing". Contains durations only.
    return NextResponse.json(data, { headers: { "Server-Timing": `auth;dur=${(t1 - t0).toFixed(0)}, data;dur=${(t2 - t1).toFixed(0)}` } });
  } catch (e) { return handleError(e); }
}
