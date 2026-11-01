import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { env } from "./env";
import { forbidden, unauthorized } from "./errors";

const COOKIE = "kooper_session";
const MAX_AGE = 60 * 60 * 24 * 7;
const key = () => new TextEncoder().encode(env().AUTH_SECRET);

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function createSession(userId: string) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
  cookies().set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env().NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
}
export const destroySession = () => cookies().delete(COOKIE);

export type Ctx = { userId: string; restaurantId: string; role: Role };

/**
 * Resolves the caller's restaurant from the signed session + a Membership row.
 * The restaurant id is NEVER read from the request body, query or headers.
 */
export async function requireCtx(allowed?: Role[]): Promise<Ctx> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) throw unauthorized();
  let uid: string;
  try { uid = (await jwtVerify(token, key())).payload.uid as string; } catch { throw unauthorized("Session expired. Please sign in again."); }
  const m = await db.membership.findFirst({ where: { userId: uid }, orderBy: { createdAt: "asc" } });
  if (!m) throw forbidden("Your account isn't linked to a restaurant.");
  if (allowed && !allowed.includes(m.role)) throw forbidden();
  return { userId: uid, restaurantId: m.restaurantId, role: m.role };
}

/** Capability map — single source of truth for RBAC. */
export const CAN = {
  inventoryRead: ["OWNER", "MANAGER", "CHEF", "INVENTORY_STAFF", "ACCOUNTANT"],
  inventoryWrite: ["OWNER", "MANAGER", "INVENTORY_STAFF"],
  recipes: ["OWNER", "MANAGER", "CHEF"],
  waste: ["OWNER", "MANAGER", "CHEF", "INVENTORY_STAFF"],
  purchasing: ["OWNER", "MANAGER"],
  receiving: ["OWNER", "MANAGER", "INVENTORY_STAFF"],
  invoices: ["OWNER", "MANAGER", "ACCOUNTANT"],
  reports: ["OWNER", "MANAGER", "ACCOUNTANT"],
  team: ["OWNER"],
} satisfies Record<string, Role[]>;
