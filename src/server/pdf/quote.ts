import "server-only";
import type { Db } from "../db";
import { getSettings } from "../services/settings";
import { quoteNumberLabel } from "../services/quotes";
import { renderQuoteHtml } from "./quote-html";

export async function quoteHtml(db: Db, id: string): Promise<{ html: string; filename: string } | null> {
  const q = await db.quote.findUnique({ where: { id }, include: { customer: true, items: { orderBy: { sortOrder: "asc" } } } });
  if (!q) return null;
  const s = await getSettings(db);
  const label = quoteNumberLabel(q);
  const html = renderQuoteHtml({
    numberLabel: label,
    date: q.date,
    validUntil: q.validUntil,
    business: { name: s.businessName, cr: s.businessCr, vatNo: s.businessVatNo, phone: s.businessPhone },
    customer: q.customer,
    items: q.items,
    subtotal: q.subtotal.toString(),
    discount: q.discount.toString(),
    shippingFee: q.shippingFee.toString(),
    vatAmount: q.vatAmount.toString(),
    vatRatePct: q.vatRatePct.toString(),
    pricesIncludeVat: q.pricesIncludeVat,
    total: q.total.toString(),
    depositPct: q.depositPct.toString(),
    terms: q.terms,
  });
  return { html, filename: `${label}.pdf` };
}
