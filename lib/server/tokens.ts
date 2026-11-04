import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import { badRequest } from "./errors";

const key = () => new TextEncoder().encode(env().AUTH_SECRET);

export async function sign(payload: Record<string, unknown>, ttl: string) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(ttl).sign(key());
}
export async function verify<T = Record<string, unknown>>(token: string, purpose: string): Promise<T> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.purpose !== purpose) throw new Error("purpose");
    return payload as T;
  } catch { throw badRequest("This link is invalid or has expired."); }
}
