/* eslint-disable @typescript-eslint/no-explicit-any -- شكل الـ webhook خارجي ومتغيّر؛ نقرأه بتسامح والنتيجة StoreOrder مضبوطة النوع */
/**
 * زد — Webhooks (https://docs.zid.sa).
 * زد ما يوقّع الطلبات، فالتحقق بتوكن سري في رابط الـ webhook: /api/webhooks/zid?token=...
 * التوكن في متغير البيئة ZID_WEBHOOK_TOKEN.
 */
import { StorePayloadError, money, num, paymentCode, safeEqual, str, type StoreOrder, type StoreOrderStatus } from "./types";

export function verifyZid(url: URL, headers: Headers, token: string | undefined): boolean {
  if (!token) return false;
  const given = url.searchParams.get("token") ?? headers.get("x-webhook-token") ?? "";
  return !!given && safeEqual(given, token);
}

const STATUS: Record<string, StoreOrderStatus> = {
  new: "NEW",
  preparing: "CONFIRMED",
  ready: "CONFIRMED",
  indelivery: "SHIPPED",
  in_delivery: "SHIPPED",
  delivered: "DELIVERED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
  reverse_in_progress: "DELIVERED",
  reversed: "RETURNED",
};

export function parseZid(body: unknown): StoreOrder | null {
  const b = body as Record<string, any>;
  if (!b || typeof b !== "object") throw new StorePayloadError("body غير صالح");
  const o = (b.order ?? b.data ?? b) as Record<string, any>;
  if (!o.id) throw new StorePayloadError("الطلب بدون id");
  const code = str(o.order_status?.code ?? o.status).toLowerCase();
  const items = ((o.products as any[]) ?? []).map((p) => {
    const q = Math.max(Math.round(num(p.quantity)), 1);
    const lineTotal = num(p.total) || num(p.price_with_tax ?? p.price) * q;
    return { sku: str(p.sku), name: str(p.name) || "منتج", quantity: q, unitPrice: money(lineTotal / q) };
  });
  const pm = str(o.payment?.method?.code ?? o.payment?.method?.name ?? o.payment_method);
  const c = (o.customer ?? {}) as Record<string, any>;
  const paymentStatus = str(o.payment_status ?? o.payment?.status).toLowerCase();
  const invoiceNo = str(o.invoice_number ?? o.invoice?.number);
  return {
    source: "ZID",
    externalId: str(o.id),
    reference: str(o.code) || null,
    status: STATUS[code] ?? null,
    storeStatus: code || str(b.event),
    date: new Date(str(o.created_at) || Date.now()),
    customer: { name: str(c.name) || "عميل زد", phone: str(c.mobile) || null },
    items,
    discount: money(Math.abs(num(o.discount_amount ?? o.coupon?.discount))),
    shippingFee: money(num(o.shipping?.method?.cost ?? o.shipping_cost ?? o.delivery_fee)),
    total: o.order_total != null ? money(num(o.order_total)) : null,
    paid: o.is_paid === true || paymentStatus === "paid" || (paymentCode(pm) !== "cod" && paymentStatus !== "pending" && paymentStatus !== "unpaid"),
    paymentMethod: paymentCode(pm),
    invoice: invoiceNo ? { number: invoiceNo, url: str(o.invoice_link ?? o.invoice?.url) || null } : null,
  };
}
