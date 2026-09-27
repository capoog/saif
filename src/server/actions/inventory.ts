"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db";
import { UserError } from "../errors";
import { actorOf, requireUser } from "../auth/session";
import { adjustStock, createBatch } from "../services/inventory";
import { createProduct, updateProduct } from "../services/products";
import { setRecipe } from "../services/recipes";
import { D } from "@/domain/money";
import { entryDate, formObject, moneyStr, optionalMoneyStr, overrideOf, qtyStr, run, type ActionState } from "./run";

const batchSchema = z.object({
  productId: z.string().min(1, "اختار المنتج"),
  quantity: qtyStr("الكمية"),
  unitPrice: moneyStr("سعر الوحدة"),
  extraCosts: optionalMoneyStr("الشحن والتكاليف"),
  paidAmount: optionalMoneyStr("المدفوع"),
  paidFull: z.string().optional(),
  paidFromId: z.string().optional(),
  supplierName: z.string().max(120).optional(),
  supplierId: z.string().optional(),
  override: z.string().optional(),
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
      supplierId: v.supplierId || null,
      override: overrideOf(fd),
      sellPrice: v.sellPrice?.trim() || null,
      note: v.note || null,
    });
  });
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  redirect(`/products/${productId}`);
}

const priceOpt = (label: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().replace(/,/g, ""))
    .refine((v) => v === "" || /^\d+(\.\d{1,4})?$/.test(v), `${label} غير صالح`);

export async function updateProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z
      .object({
        id: z.string(),
        status: z.enum(["PRIORITY_TEST", "TESTING", "ACTIVE", "STOPPED", "LATER", "AVOID"]),
        kind: z.enum(["GOODS", "BOX"]).optional(),
        unit: z.string().max(20).optional(),
        defaultSellPrice: priceOpt("سعر البيع"),
        estimatedUnitCost: priceOpt("التكلفة التقديرية"),
        notes: z.string().max(1000).optional(),
      })
      .parse(formObject(fd));
    await updateProduct(prisma, actorOf(user), v.id, {
      status: v.status,
      kind: v.kind,
      unit: v.unit,
      defaultSellPrice: v.defaultSellPrice || null,
      estimatedUnitCost: v.estimatedUnitCost || null,
      notes: v.notes ?? null,
    });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "اتحفظ" } : res;
}

export async function setRecipeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const boxId = String(fd.get("boxId"));
    const comps = fd.getAll("componentId").map(String);
    const qtys = fd.getAll("quantity").map(String);
    const lines = comps
      .map((componentId, i) => ({ componentId, quantity: (qtys[i] ?? "").trim() }))
      .filter((l) => l.componentId && l.quantity);
    for (const l of lines) if (!/^\d+(\.\d{1,3})?$/.test(l.quantity)) throw new UserError("كمية مكوّن غير صالحة");
    await setRecipe(prisma, actorOf(user), boxId, lines);
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "اتحفظت الوصفة" } : res;
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
      .object({
        name: z.string().min(1, "اكتب اسم المنتج"),
        category: z.string(),
        engineId: z.string().min(1),
        kind: z.enum(["GOODS", "BOX"]).default("GOODS"),
        defaultSellPrice: priceOpt("سعر البيع"),
        estimatedUnitCost: priceOpt("التكلفة التقديرية"),
        unit: z.string().optional(),
      })
      .parse(formObject(fd));
    id = (await createProduct(prisma, actorOf(user), { ...v, defaultSellPrice: v.defaultSellPrice || null, estimatedUnitCost: v.estimatedUnitCost || null })).id;
  });
  if (!res.ok) return res;
  revalidatePath("/products");
  redirect(`/products/${id}`);
}
