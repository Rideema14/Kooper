import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as inv from "@/lib/services/invoices";
import { notFound } from "@/lib/server/errors";
type P = { id: string; action: string };
export const POST = route<P>(CAN.invoices, async (c, req, p) => {
  if (p.action === "approve") return plain(await inv.approveInvoice(c, p.id, (await json(req, S.invoiceApprove)).receiveIntoStock));
  if (p.action === "reject") return inv.rejectInvoice(c, p.id);
  if (p.action === "payment") return inv.setInvoicePayment(c, p.id, (await json(req, S.poPayment)).paymentStatus);
  throw notFound();
});
