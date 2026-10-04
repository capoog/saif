import "server-only";
import { createHmac } from "node:crypto";
import { safeEqual } from "@/integrations/stores/types";

/** رابط عام لملف (عرض سعر) يتبعت للعميل بالواتساب — بدون دخول، ومحمي بتوقيع ما ينخمّن */
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET غير مضبوط");
  return s;
}
export function shareToken(kind: "quote", id: string): string {
  return createHmac("sha256", secret()).update(`share:${kind}:${id}`).digest("base64url").slice(0, 32);
}
export function verifyShareToken(kind: "quote", id: string, token: string): boolean {
  return safeEqual(token, shareToken(kind, id));
}

/** رقم سعودي لصيغة واتساب الدولية: 05xxxxxxxx أو 5xxxxxxxx أو +9665xxxxxxxx → 9665xxxxxxxx */
export function waPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("05") && d.length === 10) d = "966" + d.slice(1);
  else if (d.startsWith("5") && d.length === 9) d = "966" + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** رابط يفتح واتساب برسالة جاهزة (للرقم لو موجود، وإلا يختار المستخدم المحادثة) */
export function waLink(phone: string | null | undefined, text: string): string {
  const p = waPhone(phone);
  return `https://wa.me/${p ?? ""}?text=${encodeURIComponent(text)}`;
}
