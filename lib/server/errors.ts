import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public status: number, message: string, public code = "error") { super(message); }
}
export const badRequest = (m: string) => new AppError(400, m, "bad_request");
export const unauthorized = (m = "Please sign in.") => new AppError(401, m, "unauthorized");
export const forbidden = (m = "You don't have permission to do that.") => new AppError(403, m, "forbidden");
export const notFound = (m = "Not found.") => new AppError(404, m, "not_found");
export const conflict = (m: string) => new AppError(409, m, "conflict");

/** Central error → JSON mapping. Never leaks internals. */
export function handleError(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof ZodError) {
    return NextResponse.json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "validation" }, { status: 422 });
  }
  console.error("[api] unhandled error:", e);
  return NextResponse.json({ error: "Something went wrong on our side.", code: "internal" }, { status: 500 });
}
