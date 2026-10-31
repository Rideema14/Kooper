import { NextResponse } from "next/server";
import { initialInventory } from "@/lib/data";
export async function GET() { return NextResponse.json({ items: initialInventory, note: "Seed data for demo. Persist changes in the browser app." }); }
