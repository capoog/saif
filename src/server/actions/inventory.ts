"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db";
import { UserError } from "../errors";
import { actorOf, requireUser } from "../auth/session";
import { adjustStock, createBatch } from "../services/inventory";
import { createProduct, updateProduct } from "../services/products";
import { D } from "@/domain/money";
import { entryDate, formObject, moneyStr, optionalMoneyStr, qtyStr, run, type ActionState } from "./run";

const batchSchema = z.object({
  productId: z.string().min(1, "اختار المنتج"),
  quantity: qtyStr("الكمية"),
  unitPrice: moneyStr("سعر الوحدة"),
  extraCosts: optionalMoneyStr("الشحن والتكاليف"),
  paidAmount: optionalMoneyStr("المدفوع"),
  paidFull: z.string().optional(),
  paidFromId: z.string().optional(),
  supplierName: z.string().max(120).optional(),
  sellPrice: z.string().optional(),
  date: z.string().optional(),
  note: z.string().max(300).optional(),
});

export async function createBatchAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let productId = "";
  const res = await run(async () => {
    const v = batchSchema.parse(formObject(fd));
    productId = v.productId;
    const total = D(v.unitPrice).times(v.quantity).plus(v.extraCosts).toFixed(2);
    await createBatch(prisma, actorOf(user), {
      productId: v.productId,
      receivedAt: entryDate(v.date),
      quantity: v.quantity,
      unitPrice: v.unitPrice,
      extraCosts: v.extraCosts,
      paidAmount: v.paidFull === "1" ? total : v.paidAmount,
      paidFromId: v.paidFromId || null,
      supplierName: v.supplierName || null,
      sellPrice: v.sellPrice?.trim() || null,
      note: v.note || null,
    });
  });
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  redirect(`/products/${productId}`);
}

export async function updateProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z
      .object({
        id: z.string(),
        status: z.enum(["PRIORITY_TEST", "TESTING", "ACTIVE", "STOPPED", "LATER", "AVOID"]),
        defaultSellPrice: z.string().optional(),
        notes: z.string().max(1000).optional(),
      })
      .parse(formObject(fd));
    const price = v.defaultSellPrice?.trim().replace(/,/g, "");
    if (price && !/^\d+(\.\d{1,2})?$/.test(price)) throw new UserError("سعر البيع غير صالح");
    await updateProduct(prisma, actorOf(user), v.id, { status: v.status, defaultSellPrice: price || null, notes: v.notes ?? null });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "اتحفظ" } : res;
}

export async function adjustStockAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ productId: z.string(), counted: qtyStr("الكمية الفعلية"), note: z.string().optional() }).parse(formObject(fd));
    const r = await adjustStock(prisma, actorOf(user), v.productId, v.counted, new Date(), v.note);
    return { ok: true, message: r.diff.isZero() ? "مفيش فرق" : `اتسجل فرق ${r.diff.gt(0) ? "+" : ""}${r.diff.toString()} (قيمة ${r.value.toFixed(2)})` };
  });
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function createProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const res = await run(async () => {
    const v = z
      .object({ name: z.string().min(1, "اكتب اسم المنتج"), category: z.string(), engineId: z.string().min(1), defaultSellPrice: z.string().optional(), unit: z.string().optional() })
      .parse(formObject(fd));
    id = (await createProduct(prisma, actorOf(user), v)).id;
  });
  if (!res.ok) return res;
  revalidatePath("/products");
  redirect(`/products/${id}`);
}
