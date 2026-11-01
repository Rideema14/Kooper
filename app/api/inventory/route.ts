import { NextResponse } from "next/server";
const initialInventory: never[] = [];
export async function GET() { return NextResponse.json({ items: initialInventory, note: "Seed data for demo. Persist changes in the browser app." }); }
