import { NextResponse } from "next/server";
import { route } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import { badRequest } from "@/lib/server/errors";
import * as S from "@/lib/schemas";
import * as rp from "@/lib/services/reports";
export const dynamic = "force-dynamic";

export const GET = route(CAN.reports, async (c, req) => {
  const u = new URL(req.url).searchParams;
  const r = S.range.parse({ from: u.get("from") ?? undefined, to: u.get("to") ?? undefined });
  const format = u.get("format") ?? "csv", kind = u.get("kind") ?? "inventory";
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "pdf") return new NextResponse(new Uint8Array(await rp.toPdf(c, r)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="kooper-report-${stamp}.pdf"` } });
  const data = await rp.datasets(c, r);
  if (format === "xlsx") return new NextResponse(new Uint8Array(await rp.toXlsx(data)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="kooper-report-${stamp}.xlsx"` } });
  const sheet = data[kind]; if (!sheet) throw badRequest("Unknown report.");
  return new NextResponse(rp.toCsv(sheet), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="kooper-${kind}-${stamp}.csv"` } });
}, { limit: 30 });
