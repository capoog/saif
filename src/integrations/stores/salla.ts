/* eslint-disable @typescript-eslint/no-explicit-any -- شكل الـ webhook خارجي ومتغيّر؛ نقرأه بتسامح والنتيجة StoreOrder مضبوطة النوع */
/**
 * سلة — Webhooks (https://docs.salla.dev).
 * التحقق: استراتيجية Signature (هيدر x-salla-signature = HMAC-SHA256 للـ body بالمفتاح) أو Token (هيدر Authorization = المفتاح).
 * المفتاح في متغير البيئة SALLA_WEBHOOK_SECRET — ما ينكتب في الكود ولا القاعدة.
 */
import { StorePayloadError, hmacHex, money, num, paymentCode, safeEqual, str, type StoreOrder, type StoreOrderStatus } from "./types";

export function verifySalla(rawBody: string, headers: Headers, secret: string | undefined): boolean {
  if (!secret) return false;
  const sig = headers.get("x-salla-signature");
  if (sig && safeEqual(sig.toLowerCase(), hmacHex(secret, rawBody))) return true;
  const auth = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return !!auth && safeEqual(auth, secret);
}

const STATUS: Record<string, StoreOrderStatus> = {
  payment_pending: "NEW",
  under_review: "NEW",
  in_progress: "CONFIRMED",
  completed: "CONFIRMED",
  shipped: "SHIPPED",
  delivering: "SHIPPED",
  delivered: "DELIVERED",
  canceled: "CANCELLED",
  cancelled: "CANCELLED",
  restoring: "DELIVERED",
  restored: "RETURNED",
};

/** الأحداث اللي فيها طلب. غيرها يتجاهل. */
export const SALLA_ORDER_EVENTS = ["order.created", "order.updated", "order.status.updated", "order.payment.updated", "order.shipment.created", "order.cancelled", "order.refunded", "order.deleted"];

export function parseSalla(body: unknown): StoreOrder | null {
  const b = body as { event?: string; data?: Record<string, unknown>; created_at?: string };
  if (!b || typeof b !== "object") throw new StorePayloadError("body غير صالح");
  if (b.event && !SALLA_ORDER_EVENTS.includes(b.event)) return null;
  const o = ((b.data?.order as Record<string, unknown>) ?? b.data) as Record<string, any> | undefined;
  if (!o?.id) throw new StorePayloadError("الطلب بدون id");
  const statusObj = (b.data?.status as Record<string, any>) ?? o.status ?? {};
  const slug = str(typeof statusObj === "string" ? statusObj : (statusObj.slug ?? statusObj.customized?.slug ?? statusObj.name)).toLowerCase();
  let status: StoreOrderStatus | null = STATUS[slug] ?? null;
  if (b.event === "order.cancelled") status = "CANCELLED";
  if (b.event === "order.refunded") status = "RETURNED";
  if (b.event === "order.deleted") status = "CANCELLED";

  const items = ((o.items as any[]) ?? []).map((i) => {
    const q = Math.max(Math.round(num(i.quantity)), 1);
    // سعر الوحدة كما دفعه العميل (مع الضريبة إن وجدت) — إعداد "الأسعار شاملة الضريبة" يحدد التقسيم
    const lineTotal = num(i.amounts?.total) || num(i.amounts?.price_without_tax) * q || num(i.price) * q;
    return { sku: str(i.sku), name: str(i.name) || "منتج", quantity: q, unitPrice: money(lineTotal / q) };
  });
  const a = (o.amounts ?? {}) as Record<string, any>;
  const discount = Array.isArray(a.discounts) ? a.discounts.reduce((s: number, d: any) => s + num(d.discount ?? d.amount ?? d), 0) : num(a.discount ?? a.total_discount);
  const c = (o.customer ?? {}) as Record<string, any>;
  const pm = str(o.payment_method);
  const paidStatus = str(o.payment?.status ?? o.payment_status).toLowerCase();
  const invoiceNo = str(o.invoice?.invoice_number ?? o.invoice_number ?? o.invoice?.number);
  return {
    source: "SALLA",
    externalId: str(o.id),
    reference: str(o.reference_id) || null,
    status,
    storeStatus: slug || str(b.event),
    date: new Date(str(o.date?.date ?? o.created_at ?? b.created_at) || Date.now()),
    customer: { name: [str(c.first_name), str(c.last_name)].filter(Boolean).join(" ") || str(c.name) || "عميل سلة", phone: str(c.mobile) ? `${str(c.mobile_code)}${str(c.mobile)}` : null },
    items,
    discount: money(Math.abs(discount)),
    shippingFee: money(num(a.shipping_cost)),
    total: a.total ? money(num(a.total)) : null,
    paid: paymentCode(pm) !== "cod" ? paidStatus !== "pending" && paidStatus !== "unpaid" : paidStatus === "paid",
    paymentMethod: paymentCode(pm),
    invoice: invoiceNo ? { number: invoiceNo, url: str(o.invoice?.url ?? o.invoice_url) || null } : null,
  };
}
