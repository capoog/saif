import { createHmac, timingSafeEqual } from "node:crypto";

export type StoreSource = "SALLA" | "ZID";
export type StoreOrderStatus = "NEW" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "RETURNED";

/** شكل موحّد لطلب المتجر — كل منصة لها Adapter يحوّل الـ webhook لهذا الشكل */
export interface StoreOrder {
  source: StoreSource;
  externalId: string;
  reference: string | null;
  /** null = حالة ما نعرفها (تنحفظ وما تغيّر شي) */
  status: StoreOrderStatus | null;
  storeStatus: string;
  date: Date;
  customer: { name: string; phone: string | null };
  items: { sku: string; name: string; quantity: number; unitPrice: string }[];
  discount: string;
  shippingFee: string;
  total: string | null;
  paid: boolean;
  /** cod | mada | bnpl | transfer */
  paymentMethod: string;
  invoice: { number: string; url: string | null } | null;
}

export class StorePayloadError extends Error {}

/** رقم من أي شكل: 12 أو "12.50" أو { amount: 12 } */
export function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === "object" && "amount" in (v as object)) return num((v as { amount: unknown }).amount);
  return 0;
}
export const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
export const str = (v: unknown) => (v == null ? "" : String(v).trim());

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const hmacHex = (secret: string, body: string) => createHmac("sha256", secret).update(body, "utf8").digest("hex");

export function paymentCode(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("cod") || m.includes("cash")) return "cod";
  if (m.includes("tabby") || m.includes("tamara") || m.includes("bnpl")) return "bnpl";
  if (m.includes("bank") || m.includes("transfer")) return "transfer";
  return "mada";
}
