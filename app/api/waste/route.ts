import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
 const body = await req.json();
 if (!body?.item || Number(body.quantity) <= 0) return NextResponse.json({error:"Enter an item and a positive quantity."},{status:400});
 return NextResponse.json({ok:true,entry:{...body,id:`W-${Date.now()}`}}, {status:201});
}