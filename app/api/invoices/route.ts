import { NextResponse } from "next/server";
import { route, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import { badRequest, AppError } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";
import { MAX_BYTES } from "@/lib/services/extract";
import * as inv from "@/lib/services/invoices";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(CAN.invoices, async (c) => plain(await inv.listInvoices(c)));
export const POST = route(CAN.invoices, async (c, req) => {
  rateLimit(`upload:${c.userId}`, 10, 60_000); // protects the Gemini free tier
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES + 200_000) throw new AppError(413, "That file is over 10 MB.", "too_large");
  const fd = await req.formData().catch(() => null);
  const f = fd?.get("file");
  if (!(f instanceof File)) throw badRequest("Please attach a file.");
  if (f.size > MAX_BYTES) throw new AppError(413, "That file is over 10 MB.", "too_large");
  const out = await inv.uploadInvoice(c, { name: f.name.slice(0, 200), buffer: Buffer.from(await f.arrayBuffer()) });
  return NextResponse.json(plain(out), { status: 201 });
}, { limit: 60 });
