"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db";
import { actorOf, requireUser } from "../auth/session";
import { UserError } from "../errors";
import { cancelPurchaseOrder, createPurchaseOrder, createSupplier, receivePurchaseOrder, updateSupplier } from "../services/suppliers";
import { createTransaction } from "../services/transactions";
import { dayAt, entryDate, formObject, moneyStr, optionalMoneyStr, overrideOf, run, type ActionState } from "./run";

const supplierSchema = z.object({
  name: z.string().trim().min(1, "اكتب اسم المورد"),
  type: z.string(),
  phone: z.string().max(30).optional(),
  contact: z.string().max(120).optional(),
  city: z.string().max(60).optional(),
  rating: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

function toSupplier(fd: FormData) {
  const v = supplierSchema.parse(formObject(fd));
  return { ...v, rating: v.rating ? Number(v.rating) : null };
}

export async function createSupplierAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const res = await run(async () => {
    id = (await createSupplier(prisma, actorOf(user), toSupplier(fd))).id;
  });
  if (!res.ok) return res;
  revalidatePath("/suppliers");
  redirect(`/suppliers/${id}`);
}

export async function updateSupplierAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    await updateSupplier(prisma, actorOf(user), String(fd.get("id")), toSupplier(fd));
  });
  if (res.ok) revalidatePath("/suppliers");
  return res.ok ? { ok: true, message: "انحفظ" } : res;
}

export async function paySupplierAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ supplierId: z.string(), amount: moneyStr("المبلغ"), accountId: z.string().min(1), date: z.string().optional(), note: z.string().optional() }).parse(formObject(fd));
    await createTransaction(prisma, actorOf(user), {
      type: "WITHDRAWAL",
      category: "SUPPLIER_PAYMENT",
      supplierId: v.supplierId,
      amount: v.amount,
      accountId: v.accountId,
      date: entryDate(v.date),
      note: v.note || null,
      override: overrideOf(fd),
    });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "تسجّل السداد" } : res;
}

export async function createPurchaseOrderAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const res = await run(async () => {
    let raw: unknown;
    try {
      raw = JSON.parse(String(fd.get("payload") ?? "{}"));
    } catch {
      throw new UserError("بيانات غير صالحة");
    }
    const v = z
      .object({
        supplierId: z.string().min(1, "اختار المورد"),
        expectedAt: z.string().optional(),
        extraCosts: optionalMoneyStr("الشحن"),
        note: z.string().max(1000).optional(),
        items: z
          .array(
            z.object({
              productId: z.string().min(1, "اختار المنتج"),
              quantity: z.string().regex(/^\d+(\.\d{1,3})?$/, "كمية غير صالحة"),
              unitPrice: z.string().regex(/^\d+(\.\d{1,4})?$/, "سعر غير صالح"),
            }),
          )
          .min(1, "أضف بند واحد على الأقل"),
      })
      .parse(raw);
    id = (await createPurchaseOrder(prisma, actorOf(user), { ...v, date: new Date(), expectedAt: dayAt(v.expectedAt) })).id;
  });
  if (!res.ok) return res;
  revalidatePath("/suppliers");
  redirect(`/purchase-orders/${id}`);
}

export async function receivePurchaseOrderAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ id: z.string(), paidNow: optionalMoneyStr("المدفوع"), paidFromId: z.string().optional(), date: z.string().optional() }).parse(formObject(fd));
    await receivePurchaseOrder(prisma, actorOf(user), v.id, { date: entryDate(v.date), paidNow: v.paidNow, paidFromId: v.paidFromId || null, override: overrideOf(fd) });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "تسلّم ودخل المخزون ✓" } : res;
}

export async function cancelPurchaseOrderAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    await cancelPurchaseOrder(prisma, actorOf(user), String(fd.get("id")));
  });
  if (res.ok) revalidatePath("/suppliers");
  return res;
}
