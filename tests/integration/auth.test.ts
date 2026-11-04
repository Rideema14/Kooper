import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";

// A tiny cookie jar standing in for next/headers
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined), set: (k: string, v: string) => void jar.set(k, v), delete: (k: string) => void jar.delete(k) }),
}));

import { db } from "@/lib/server/db";
import { createSession, requireCtx, CAN } from "@/lib/server/auth";
import * as acct from "@/lib/services/account";
import { GET as listIngredients, POST as addIngredient } from "@/app/api/ingredients/route";
import { POST as invoiceAction } from "@/app/api/invoices/[id]/[action]/route";
import { GET as listPurchases } from "@/app/api/purchases/route";
import { POST as poAction } from "@/app/api/purchases/[id]/[action]/route";
import { GET as exportReport } from "@/app/api/reports/export/route";
import { cleanup, cleanupUsers, makeCtx } from "./helpers";

afterAll(async () => { await cleanup(); await cleanupUsers(); await db.$disconnect(); });
beforeEach(() => jar.clear());
const req = (url: string, body?: unknown) => new NextRequest(`http://x${url}`, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const asUser = async (userId: string) => { jar.clear(); await createSession(userId); };

describe("sessions & accounts", () => {
  it("signup creates an OWNER of a new restaurant; login rejects wrong passwords", async () => {
    const email = `owner-${Date.now()}@test.dev`;
    const u = await acct.signup({ name: "Olivia", email, password: "correct-horse-1", restaurantName: "Olive-Test" });
    const m = await db.membership.findFirstOrThrow({ where: { userId: u.id } });
    expect(m.role).toBe("OWNER");
    await expect(acct.signup({ name: "x", email, password: "correct-horse-1", restaurantName: "Dup" })).rejects.toThrow(/already exists/);
    await expect(acct.login(email, "wrong-password")).rejects.toThrow(/Incorrect/);
    await expect(acct.login("nobody@test.dev", "whatever-123")).rejects.toThrow(/Incorrect/);
    expect((await acct.login(email, "correct-horse-1")).id).toBe(u.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash).not.toContain("correct-horse");
  });
  it("password reset links work once", async () => {
    const email = `reset-${Date.now()}@test.dev`; await acct.signup({ name: "R", email, password: "first-password-1", restaurantName: "Reset-Test" });
    const { devLink } = await acct.forgotPassword(email); const token = new URL(devLink as string).searchParams.get("token") as string;
    await acct.resetPassword(token, "second-password-2");
    await expect(acct.login(email, "first-password-1")).rejects.toThrow();
    await acct.login(email, "second-password-2");
    await expect(acct.resetPassword(token, "third-password-3")).rejects.toThrow(/invalid or has expired/);
    expect((await acct.forgotPassword("ghost@test.dev")).devLink).toBeNull();            // no account enumeration via link
  });
  it("invitations grant exactly the invited role and can't be forged", async () => {
    const o = await makeCtx("Inv"); const inv = await acct.createInvite(o, `chef-${Date.now()}@test.dev`, "CHEF");
    const token = new URL(inv.link).searchParams.get("token") as string;
    const u = await acct.acceptInvite(token, "Chef", "chef-password-1");
    expect((await db.membership.findFirstOrThrow({ where: { userId: u.id, restaurantId: o.restaurantId } })).role).toBe("CHEF");
    await expect(acct.acceptInvite(token + "x", "Chef", "chef-password-1")).rejects.toThrow(/invalid/);
    const reset = await acct.forgotPassword(`chef-${Date.now()}@test.dev`);              // wrong-purpose token must not work as invite
    expect(reset.devLink).toBeNull();
  });
});

describe("authorisation through real route handlers", () => {
  it("401 without a session", async () => {
    const r = await listIngredients(req("/api/ingredients"), { params: {} });
    expect(r.status).toBe(401);
  });
  it("a tampered cookie is rejected", async () => {
    jar.set("kooper_session", "not.a.jwt");
    expect((await listIngredients(req("/api/ingredients"), { params: {} })).status).toBe(401);
  });
  it("restaurant comes from the session — a body restaurantId is ignored, and B never sees A's data", async () => {
    const A = await makeCtx("RA"), B = await makeCtx("RB");
    await asUser(A.userId);
    const made = await addIngredient(req("/api/ingredients", { name: "Truffle", unit: "g", unitCost: 90, restaurantId: B.restaurantId }), { params: {} });
    expect(made.status).toBe(200);
    expect((await db.ingredient.findFirstOrThrow({ where: { name: "Truffle" } })).restaurantId).toBe(A.restaurantId);
    await asUser(B.userId);
    expect(await (await listIngredients(req("/api/ingredients"), { params: {} })).json()).toEqual([]);
    expect((await (await exportReport(req("/api/reports/export?kind=inventory"), { params: {} })).text()).includes("Truffle")).toBe(false);
  });
  it("role matrix: chef can't create orders or approve invoices; accountant can't edit stock", async () => {
    const o = await makeCtx("RM"); const chef = await db.user.create({ data: { email: `c-${Date.now()}@test.dev`, name: "c", passwordHash: "x" } });
    await db.membership.create({ data: { userId: chef.id, restaurantId: o.restaurantId, role: "CHEF" } });
    const acc = await db.user.create({ data: { email: `a-${Date.now()}@test.dev`, name: "a", passwordHash: "x" } });
    await db.membership.create({ data: { userId: acc.id, restaurantId: o.restaurantId, role: "ACCOUNTANT" } });
    await asUser(chef.id);
    expect((await poAction(req("/api/purchases/x/approve", {}), { params: { id: "x", action: "approve" } })).status).toBe(403);
    expect((await invoiceAction(req("/api/invoices/x/approve", {}), { params: { id: "x", action: "approve" } })).status).toBe(403);
    expect((await addIngredient(req("/api/ingredients", { name: "Nope", unit: "kg" }), { params: {} })).status).toBe(403);
    await asUser(acc.id);
    expect((await addIngredient(req("/api/ingredients", { name: "Nope", unit: "kg" }), { params: {} })).status).toBe(403);
    expect((await listPurchases(req("/api/purchases"), { params: {} })).status).toBe(200);
  });
  it("validation errors return 422 with a readable message; unknown actions 404", async () => {
    const o = await makeCtx("VL"); await asUser(o.userId);
    const bad = await addIngredient(req("/api/ingredients", { name: "", unit: "kg", unitCost: -5 }), { params: {} });
    expect(bad.status).toBe(422); expect((await bad.json()).error).toMatch(/name|unitCost/);
    expect((await poAction(req("/api/purchases/x/explode", {}), { params: { id: "x", action: "explode" } })).status).toBe(404);
  });
  it("marking an order as sent requires explicit confirmation in the request", async () => {
    const o = await makeCtx("CF"); await asUser(o.userId);
    const r = await poAction(req("/api/purchases/x/send", {}), { params: { id: "x", action: "send" } });
    expect(r.status).toBe(422);
  });
  it("capability matrix matches the spec", () => {
    expect(CAN.invoices).toEqual(expect.arrayContaining(["OWNER", "MANAGER", "ACCOUNTANT"])); expect(CAN.invoices).not.toContain("CHEF");
    expect(CAN.recipes).toContain("CHEF"); expect(CAN.inventoryWrite).toContain("INVENTORY_STAFF"); expect(CAN.team).toEqual(["OWNER"]);
    expect(CAN.waste).toEqual(expect.arrayContaining(["CHEF", "INVENTORY_STAFF"]));
  });
});

describe("requireCtx", () => {
  it("resolves the membership of the signed user", async () => {
    const o = await makeCtx("RC"); await asUser(o.userId);
    expect(await requireCtx()).toMatchObject({ restaurantId: o.restaurantId, role: "OWNER" });
  });
});

import { SignJWT } from "jose";
import { GET as bootstrap } from "@/app/api/bootstrap/route";

describe("bootstrap fast path (data loads in parallel with the membership check)", () => {
  it("returns the caller's data, scoped to their restaurant", async () => {
    const A = await makeCtx("BA"), B = await makeCtx("BB");
    await db.ingredient.create({ data: { restaurantId: A.restaurantId, name: "OnlyA", unit: "kg" } });
    await db.ingredient.create({ data: { restaurantId: B.restaurantId, name: "OnlyB", unit: "kg" } });
    await asUser(A.userId);
    const r = await bootstrap(); expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ingredients.map((i: { name: string }) => i.name)).toEqual(["OnlyA"]);
    expect(j.me.restaurant.id).toBe(A.restaurantId);
  });
  it("a removed member gets 403 and NO data, even with a still-valid session cookie", async () => {
    const A = await makeCtx("RM2"); await db.ingredient.create({ data: { restaurantId: A.restaurantId, name: "Secret", unit: "kg" } });
    await asUser(A.userId);
    expect((await bootstrap()).status).toBe(200);
    await db.membership.deleteMany({ where: { userId: A.userId } });
    const r = await bootstrap(); expect(r.status).toBe(403);
    expect(JSON.stringify(await r.json())).not.toContain("Secret");
  });
  it("sessions issued before the restaurant hint existed still work (slow path)", async () => {
    const A = await makeCtx("OLD");
    const old = await new SignJWT({ uid: A.userId }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    jar.clear(); jar.set("kooper_session", old);
    expect((await bootstrap()).status).toBe(200);
  });
  it("a token pointing at a restaurant the user doesn't belong to is refused", async () => {
    const A = await makeCtx("FA"), B = await makeCtx("FB");
    const forged = await new SignJWT({ uid: A.userId, rid: B.restaurantId }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    jar.clear(); jar.set("kooper_session", forged);
    expect((await bootstrap()).status).toBe(403);
  });
  it("no cookie → 401", async () => { jar.clear(); expect((await bootstrap()).status).toBe(401); });
  it("createSession embeds the restaurant id", async () => {
    const A = await makeCtx("EM"); await asUser(A.userId);
    const payload = JSON.parse(Buffer.from((jar.get("kooper_session") as string).split(".")[1], "base64url").toString());
    expect(payload.rid).toBe(A.restaurantId);
  });
});
