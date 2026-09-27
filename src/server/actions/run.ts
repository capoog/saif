import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { riyadhDateKey, riyadhStartOfDay } from "@/domain/plan-calendar";
import { UserError } from "../errors";
import { RuleViolationError } from "../rules";

export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  data?: unknown;
  /** العملية اتعترضت بقواعد المخاطر — الواجهة تطلب سبب للتجاوز */
  violations?: { title: string; detail: string }[];
};

/** يشغّل منطق الـ action ويحوّل الأخطاء المتوقعة لرسالة عربية بدل ما الصفحة تقع */
export async function run(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    if (e instanceof RuleViolationError) return { ok: false, error: "العملية دي عكس قواعد المخاطر", violations: e.violations.map(({ title, detail }) => ({ title, detail })) };
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "بيانات غير صالحة" };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "القيمة مكررة" };
    console.error(e);
    return { ok: false, error: "حصل خطأ غير متوقع. حاول تاني." };
  }
}

/** تاريخ من input[type=date]: النهارده = الوقت الحالي، يوم سابق = 12 الظهر بتوقيت الرياض. المستقبل مرفوض. */
export function entryDate(key: string | undefined | null): Date {
  const now = new Date();
  const today = riyadhDateKey(now);
  if (!key || key === today) return now;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new UserError("تاريخ غير صالح");
  if (key > today) throw new UserError("مينفعش تسجل عملية بتاريخ في المستقبل");
  return new Date(riyadhStartOfDay(key).getTime() + 12 * 3600000);
}

export const moneyStr = (label: string) =>
  z
    .string({ error: `${label} مطلوب` })
    .trim()
    .transform((v) => v.replace(/,/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))))
    .refine((v) => /^-?\d+(\.\d{1,2})?$/.test(v), `${label}: رقم غير صالح (خانتين عشريتين بحد أقصى)`);

export const optionalMoneyStr = (label: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().replace(/,/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))) || "0")
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), `${label}: رقم غير صالح`);

export const intStr = (label: string) =>
  z
    .string({ error: `${label} مطلوب` })
    .trim()
    .transform((v) => v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))))
    .refine((v) => /^\d+$/.test(v), `${label}: رقم صحيح`)
    .transform(Number);

/** كمية بحد أقصى 3 خانات عشرية (كجم مثلًا) */
export const qtyStr = (label: string) =>
  z
    .string({ error: `${label} مطلوب` })
    .trim()
    .transform((v) => v.replace(/,/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))))
    .refine((v) => /^\d+(\.\d{1,3})?$/.test(v), `${label}: رقم غير صالح`);

/** تاريخ مستقبلي أو ماضي (متابعة، تسليم): الساعة المحددة بتوقيت الرياض */
export function dayAt(key: string | undefined | null, hour = 9): Date | null {
  if (!key) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new UserError("تاريخ غير صالح");
  return new Date(riyadhStartOfDay(key).getTime() + hour * 3600000);
}

/** سبب تجاوز القواعد من الفورم (فاضي = مفيش تجاوز) */
export function overrideOf(fd: FormData): string | null {
  const v = fd.get("override");
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function formObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}
