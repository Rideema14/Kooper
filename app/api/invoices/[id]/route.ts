import { route, json, plain } from "@/lib/server/route";
import { CAN } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const dynamic = "force-dynamic";
import * as inv from "@/lib/services/invoices";
type P = { id: string };
export const GET = route<P>(CAN.invoices, async (c, _r, p) => plain(await inv.getInvoice(c, p.id)));
export const PATCH = route<P>(CAN.invoices, async (c, req, p) => plain(await inv.updateInvoice(c, p.id, await json(req, S.invoiceUpdate))));
