import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
 const body = await req.json();
 if (!body?.item || !Number.isFinite(Number(body?.quantity)) || Number(body.quantity) <= 0)
   return NextResponse.json({ error: "A valid item and positive quantity are required." }, { status: 400 });
 return NextResponse.json({ ok: true, status: "Needs approval", message: "Purchase suggestion created. No supplier order was placed.", purchase: body }, { status: 201 });
}