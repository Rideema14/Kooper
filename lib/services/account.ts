import type { Role } from "@prisma/client";
import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { hashPassword, verifyPassword } from "@/lib/server/auth";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "@/lib/server/errors";
import { sendEmail } from "@/lib/server/email";
import { sign, verify } from "@/lib/server/tokens";
import { env } from "@/lib/server/env";

const DUMMY = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.4Qm8vYB1k0m1L1x1u1m1k1x1u1m1k"; // constant-time-ish miss path
const appUrl = () => process.env.APP_URL || "http://localhost:3000";
const isProd = () => env().NODE_ENV === "production";

export async function signup(p: { name: string; email: string; password: string; restaurantName: string }) {
  if (await db.user.findUnique({ where: { email: p.email } })) throw conflict("An account with that email already exists.");
  const passwordHash = await hashPassword(p.password);
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email: p.email, name: p.name, passwordHash } });
    const r = await tx.restaurant.create({ data: { name: p.restaurantName } });
    await tx.membership.create({ data: { userId: u.id, restaurantId: r.id, role: "OWNER" } });
    await audit(tx, { restaurantId: r.id, userId: u.id }, "restaurant.create", "Restaurant", r.id);
    return u;
  });
  return user;
}

export async function login(email: string, password: string) {
  const u = await db.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, u?.passwordHash ?? DUMMY);
  if (!u || !ok) throw unauthorized("Incorrect email or password.");
  return u;
}

export async function me(userId: string, restaurantId: string) {
  const [u, m, r] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true } }),
    db.membership.findFirstOrThrow({ where: { userId, restaurantId } }),
    db.restaurant.findUniqueOrThrow({ where: { id: restaurantId } }),
  ]);
  return { user: u, role: m.role, restaurant: { id: r.id, name: r.name, currency: r.currency } };
}

export async function forgotPassword(email: string) {
  const u = await db.user.findUnique({ where: { email } });
  if (!u) return { devLink: null as string | null, emailed: false };
  const token = await sign({ purpose: "reset", uid: u.id, fp: u.passwordHash.slice(-12) }, "1h");
  const link = `${appUrl()}/reset?token=${token}`;
  const res = await sendEmail(u.email, "Reset your Kooper password", `<p>Use this link within one hour:</p><p><a href="${link}">${link}</a></p><p>If you didn't ask for this, ignore this email.</p>`);
  return { emailed: res.sent, devLink: !res.sent && !isProd() ? link : null };
}
export async function resetPassword(token: string, password: string) {
  const t = await verify<{ uid: string; fp: string }>(token, "reset");
  const u = await db.user.findUnique({ where: { id: t.uid } });
  if (!u || u.passwordHash.slice(-12) !== t.fp) throw badRequest("This link is invalid or has expired."); // fingerprint makes it single-use
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(password) } });
}

export async function createInvite(ctx: { restaurantId: string; userId: string }, email: string, role: Exclude<Role, "OWNER">) {
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: ctx.restaurantId } });
  const token = await sign({ purpose: "invite", rid: ctx.restaurantId, role, email }, "7d");
  const link = `${appUrl()}/invite?token=${token}`;
  const res = await sendEmail(email, `You're invited to ${r.name} on Kooper`, `<p>You've been invited as ${role.replace("_", " ").toLowerCase()}.</p><p><a href="${link}">Accept the invitation</a> (valid 7 days).</p>`);
  await audit(db, ctx, "team.invite", "Membership", null, { email, role });
  return { link, emailed: res.sent, emailNote: res.reason ?? null };
}
export async function acceptInvite(token: string, name: string, password: string) {
  const t = await verify<{ rid: string; role: Role; email: string }>(token, "invite");
  let u = await db.user.findUnique({ where: { email: t.email } });
  if (u) { if (!(await verifyPassword(password, u.passwordHash))) throw unauthorized("That email already has an account — enter its existing password to join."); }
  else u = await db.user.create({ data: { email: t.email, name, passwordHash: await hashPassword(password) } });
  await db.membership.upsert({ where: { userId_restaurantId: { userId: u.id, restaurantId: t.rid } }, create: { userId: u.id, restaurantId: t.rid, role: t.role }, update: { role: t.role } });
  await audit(db, { restaurantId: t.rid, userId: u.id }, "team.join", "Membership", u.id, { role: t.role });
  return u;
}

export const listTeam = (restaurantId: string) =>
  db.membership.findMany({ where: { restaurantId }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } });
export async function setRole(ctx: { restaurantId: string; userId: string }, membershipId: string, role: Exclude<Role, "OWNER">) {
  const m = await db.membership.findFirst({ where: { id: membershipId, restaurantId: ctx.restaurantId } });
  if (!m) throw notFound("Member not found.");
  if (m.role === "OWNER") throw forbidden("The owner's role can't be changed.");
  await db.membership.update({ where: { id: m.id }, data: { role } });
  await audit(db, ctx, "team.role", "Membership", m.id, { role });
}
export async function removeMember(ctx: { restaurantId: string; userId: string }, membershipId: string) {
  const m = await db.membership.findFirst({ where: { id: membershipId, restaurantId: ctx.restaurantId } });
  if (!m) throw notFound("Member not found.");
  if (m.role === "OWNER") throw forbidden("The owner can't be removed.");
  await db.membership.delete({ where: { id: m.id } });
  await audit(db, ctx, "team.remove", "Membership", m.id);
}
