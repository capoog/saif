"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db";
import { actorOf, requireUser } from "../auth/session";
import { UserError } from "../errors";
import { cancelContract, createContractFromQuote, createQuote, recordContractPayment, setQuoteStatus } from "../services/quotes";
import { dayAt, entryDate, formObject, moneyStr, optionalMoneyStr, overrideOf, run, type ActionState } from "./run";

function payload(fd: FormData): unknown {
  try {
    return JSON.parse(String(fd.get("payload") ?? "{}"));
  } catch {
    throw new UserError("بيانات غير صالحة");
  }
}

const quoteSchema = z.object({
  customerId: z.string().min(1, "اختار العميل"),
  dealId: z.string().optional(),
  validityDays: z.coerce.number().int().min(1).max(90),
  depositPct: z.coerce.number().min(0).max(100),
  discount: optionalMoneyStr("الخصم"),
  shippingFee: optionalMoneyStr("الشحن"),
  terms: z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().optional(),
        description: z.string().max(300),
        quantity: z.number().int().positive("الكمية لازم تكون أكبر من صفر"),
        unitPrice: moneyStr("السعر"),
      }),
    )
    .min(1, "أضف بند واحد على الأقل"),
});

export async function createQuoteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const res = await run(async () => {
    const v = quoteSchema.parse(payload(fd));
    const q = await createQuote(prisma, actorOf(user), {
      customerId: v.customerId,
      dealId: v.dealId || null,
      date: new Date(),
      validityDays: v.validityDays,
      depositPct: v.depositPct,
      discount: v.discount,
      shippingFee: v.shippingFee,
      terms: v.terms,
      items: v.items.map((i) => ({ ...i, productId: i.productId || null })),
    });
    id = q.id;
  });
  if (!res.ok) return res;
  revalidatePath("/quotes");
  redirect(`/quotes/${id}`);
}

export async function setQuoteStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ id: z.string(), status: z.enum(["DRAFT", "SENT", "REJECTED"]) }).parse(formObject(fd));
    await setQuoteStatus(prisma, actorOf(user), v.id, v.status);
  });
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function createContractAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const res = await run(async () => {
    const v = z
      .object({
        quoteId: z.string(),
        signedAt: z.string(),
        deliveries: z.array(z.object({ date: z.string().min(1, "حدد تاريخ كل دفعة"), quantities: z.array(z.number().int().min(0)) })).min(1),
        note: z.string().max(1000).optional(),
      })
      .parse(payload(fd));
    const k = await createContractFromQuote(prisma, actorOf(user), v.quoteId, {
      signedAt: entryDate(v.signedAt),
      deliveries: v.deliveries.map((d) => ({ date: dayAt(d.date, 12)!, quantities: d.quantities })),
      note: v.note,
      override: overrideOf(fd),
    });
    id = k.id;
  });
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  redirect(`/b2b/${id}`);
}

export async function contractPaymentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ id: z.string(), amount: moneyStr("المبلغ"), accountId: z.string().min(1), method: z.string().default("transfer"), date: z.string().optional() }).parse(formObject(fd));
    await recordContractPayment(prisma, actorOf(user), v.id, { amount: v.amount, accountId: v.accountId, method: v.method, date: entryDate(v.date) });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "تسجّلت الدفعة" } : res;
}

export async function cancelContractAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    await cancelContract(prisma, actorOf(user), String(fd.get("id")), String(fd.get("reason") ?? ""));
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "انلغى العقد" } : res;
}
