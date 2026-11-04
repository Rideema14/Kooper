import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: send visitors without a session cookie to /login. Real verification happens server-side in every API route.
export function middleware(req: NextRequest) {
  if (!req.cookies.get("kooper_session")) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/"] };
