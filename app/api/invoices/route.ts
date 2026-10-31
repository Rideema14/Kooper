import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  const data = await req.formData();
  const file = data.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Please attach a file." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "That file is over the 10 MB demo limit." }, { status: 413 });
  const name = file.name.toLowerCase();
  const allowed = [".pdf",".png",".jpg",".jpeg",".csv",".xlsx"];
  if (!allowed.some(ext => name.endsWith(ext))) return NextResponse.json({ error: "Supported demo formats: PDF, PNG, JPG, CSV, XLSX." }, { status: 415 });
  return NextResponse.json({
    filename: file.name,
    status: "preview",
    extracted: [
      { ingredient: "Tomatoes", quantity: 10, unit: "kg", unitPrice: 34, total: 340 },
      { ingredient: "Olive oil", quantity: 2, unit: "L", unitPrice: 620, total: 1240 },
      { ingredient: "Mozzarella", quantity: 3, unit: "kg", unitPrice: 390, total: 1170 }
    ],
    warning: "Demo extraction only. Verify every value against the original document before saving."
  });
}