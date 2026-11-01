import { z } from "zod";

const num = z.coerce.number().finite();
const pos = num.positive();
const nonneg = num.min(0);
const name = z.string().trim().min(1).max(120);
const optStr = z.string().trim().max(500).nullish().transform((v) => v || null).optional();
const date = z.coerce.date();

export const signupSchema = z.object({
  name, email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  restaurantName: name,
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });
export const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetSchema = z.object({ token: z.string().min(10), password: z.string().min(10).max(200) });
export const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(["MANAGER", "CHEF", "INVENTORY_STAFF", "ACCOUNTANT"]) });
export const acceptInviteSchema = z.object({ token: z.string().min(10), name, password: z.string().min(10).max(200) });
export const restaurantSchema = z.object({ name });
export const roleSchema = z.object({ role: z.enum(["MANAGER", "CHEF", "INVENTORY_STAFF", "ACCOUNTANT"]) });

export const supplierSchema = z.object({ name, contactName: optStr, phone: optStr, email: optStr, notes: optStr });
export const supplierPriceSchema = z.object({ ingredientId: z.string().min(1), price: nonneg });

export const ingredientCreate = z.object({
  name, category: z.string().trim().max(60).default("General"), unit: z.string().trim().min(1).max(12),
  unitCost: nonneg.default(0), minStock: nonneg.default(0), maxStock: nonneg.optional().nullable(), reorderLevel: nonneg.default(0),
  supplierId: z.string().optional().nullable(), openingStock: nonneg.optional(), expiryDate: date.optional().nullable(),
});
export const ingredientPatch = ingredientCreate.omit({ openingStock: true, expiryDate: true }).partial();

export const stockReceive = z.object({ quantity: pos, unitCost: nonneg.optional(), expiryDate: date.optional().nullable(), batchCode: optStr, reason: optStr, idempotencyKey: z.string().max(80).optional() });
export const stockConsume = z.object({ quantity: pos, reason: optStr, idempotencyKey: z.string().max(80).optional() });
export const stockAdjust = z.object({ newTotal: nonneg, reason: optStr, idempotencyKey: z.string().max(80).optional() });

export const poItem = z.object({ ingredientId: z.string().min(1), quantity: pos, unitPrice: nonneg.optional() });
export const poCreate = z.object({ supplierId: z.string().optional().nullable(), items: z.array(poItem).min(1).max(100), notes: optStr, expectedAt: date.optional().nullable() });
export const poUpdate = poCreate.partial();
export const poSend = z.object({ confirmPlacedWithSupplier: z.literal(true, { message: "Confirm that you have placed this order with the supplier." }) });
export const poReceive = z.object({
  lines: z.array(z.object({ itemId: z.string(), quantity: pos, expiryDate: date.optional().nullable(), batchCode: optStr })).min(1),
  idempotencyKey: z.string().max(80).optional(),
});
export const poPayment = z.object({ paymentStatus: z.enum(["UNPAID", "PARTIAL", "PAID"]) });

export const invoiceItem = z.object({
  rawName: name, ingredientId: z.string().optional().nullable(), quantity: pos, unit: z.string().trim().max(12).optional().nullable(),
  unitPrice: nonneg, lineTotal: nonneg,
});
export const invoiceUpdate = z.object({
  supplierName: optStr, number: optStr, invoiceDate: date.optional().nullable(), dueDate: date.optional().nullable(),
  subtotal: nonneg.optional().nullable(), tax: nonneg.optional().nullable(), total: nonneg.optional().nullable(),
  items: z.array(invoiceItem).max(300),
});
export const invoiceApprove = z.object({ receiveIntoStock: z.boolean().default(false) });

export const extractionSchema = z.object({
  supplierName: z.string().nullable().optional(), invoiceNumber: z.string().nullable().optional(),
  invoiceDate: z.string().nullable().optional(), dueDate: z.string().nullable().optional(),
  items: z.array(z.object({
    name: z.string(), quantity: z.coerce.number(), unit: z.string().nullable().optional(),
    unitPrice: z.coerce.number(), lineTotal: z.coerce.number().nullable().optional(),
  })),
  subtotal: z.coerce.number().nullable().optional(), tax: z.coerce.number().nullable().optional(), total: z.coerce.number().nullable().optional(),
});
export type Extraction = z.infer<typeof extractionSchema>;

export const recipeSchema = z.object({
  name, servings: z.coerce.number().int().min(1).max(1000).default(1), sellingPrice: nonneg,
  lines: z.array(z.object({ ingredientId: z.string().min(1), quantity: pos })).max(60),
});

export const wasteSchema = z.object({
  ingredientId: z.string().min(1), quantity: pos, reason: z.string().trim().min(1).max(60),
  department: z.string().trim().max(60).optional().nullable(), occurredAt: date.optional(), idempotencyKey: z.string().max(80).optional(),
});

export const assistantSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(["user", "bot"]), text: z.string().max(2000) })).max(12).default([]),
});

export const range = z.object({ from: date.optional(), to: date.optional() });
