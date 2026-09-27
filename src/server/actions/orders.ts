"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db";
import { actorOf, requireUser } from "../auth/session";
import { addPayment, changeOrderStatus, createOrder, setOfficialInvoice } from "../services/orders";
import { UserError } from "../errors";
import { PAYMENT_METHODS } from "../chart";
import { entryDate, formObject, moneyStr, optionalMoneyStr, run, type ActionState } from "./run";

const orderSchema = z.object({
  channel: z.string().min(1, "اختار القناة"),
  date: z.string().optional(),
  status: z.enum(["NEW", "CONFIRMED", "SHIPPED", "DELIVERED"]),
  customerName: z.string().max(120).optional(),
  customerPhone: z.string().max(30).optional(),
  items: z
    .array(z.object({ productId: z.string().min(1, "اختار المنتج"), quantity: z.number().int().positive("الكمية لازم تكون أكبر من صفر"), unitPrice: moneyStr("السعر") }))
    .min(1, "أضف منتج واحد على الأقل"),
  discount: optionalMoneyStr("الخصم"),
  shippingFee: optionalMoneyStr("الشحن"),
  payMode: z.enum(["full", "partial", "none"]),
  payAmount: optionalMoneyStr("المبلغ المدفوع"),
  method: z.string(),
  accountId: z.string().optional(),
  officialInvoiceNo: z.string().max(60).optional(),
  note: z.string().max(500).optional(),
});

export async function createOrderAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const res = await run(async () => {
    let raw: unknown;
    try {
      raw = JSON.parse(String(fd.get("payload") ?? "{}"));
    } catch {
      throw new UserError("بيانات الطلب غير صالحة");
    }
    const v = orderSchema.parse(raw);
    const date = entryDate(v.date);
    const method = PAYMENT_METHODS.find((m) => m.code === v.method);
    if (!method) throw new UserError("اختار طريقة الدفع");

    let payment = null;
    if (v.payMode !== "none") {
      if (!v.accountId) throw new UserError("اختار حساب الاستلام");
      // "full" = الإجمالي المحسوب في السيرفر (مو اللي جاي من الجوال)
      payment = { amount: v.payMode === "full" ? "FULL" : v.payAmount, method: v.method, accountId: v.accountId, date };
    }
    const order = await createOrder(prisma, actorOf(user), {
      date,
      channel: v.channel,
      status: v.status,
      customer: v.customerName?.trim() ? { name: v.customerName, phone: v.customerPhone } : null,
      items: v.items,
      discount: v.discount,
      shippingFee: v.shippingFee,
      paymentMethod: v.method,
      payment,
      officialInvoiceNo: v.officialInvoiceNo || null,
      note: v.note || null,
    });
    id = order.id;
  });
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  redirect(`/orders/${id}?created=1`);
}

export async function changeStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z
      .object({
        id: z.string(),
        to: z.enum(["CONFIRMED", "SHIPPED", "DELIVERED", "RETURNED", "CANCELLED"]),
        refund: z.string().optional(),
        refundAccountId: z.string().optional(),
      })
      .parse(formObject(fd));
    const refund = v.refund === "1" && v.refundAccountId ? { accountId: v.refundAccountId, method: "refund" } : null;
    await changeOrderStatus(prisma, actorOf(user), v.id, v.to, { refund });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function addPaymentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ id: z.string(), amount: moneyStr("المبلغ"), method: z.string(), accountId: z.string().min(1), date: z.string().optional() }).parse(formObject(fd));
    await addPayment(prisma, actorOf(user), v.id, { amount: v.amount, method: v.method, accountId: v.accountId, date: entryDate(v.date) });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "تسجّلت الدفعة" } : res;
}

export async function setInvoiceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ id: z.string(), no: z.string().max(60), url: z.union([z.literal(""), z.url("رابط غير صالح")]) }).parse(formObject(fd));
    await setOfficialInvoice(prisma, actorOf(user), v.id, v.no.trim(), v.url.trim());
  });
  if (res.ok) revalidatePath("/orders");
  return res.ok ? { ok: true, message: "انحفظت" } : res;
}
