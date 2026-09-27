"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db";
import { actorOf, requireUser } from "../auth/session";
import { addCarCost, buyCar, cancelCar, createCar, createCarQuote, sellCar, setChecklist, updateCar } from "../services/cars";
import { entryDate, formObject, moneyStr, overrideOf, run, type ActionState } from "./run";

const priceOpt = z
  .string()
  .optional()
  .transform((v) => (v ?? "").replace(/,/g, "").trim())
  .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "سعر غير صالح");

const carSchema = z.object({
  make: z.string().trim().min(1, "اكتب الشركة والموديل"),
  year: z.coerce.number().int("سنة الصنع رقم"),
  mileage: z
    .string()
    .optional()
    .transform((v) => (v ?? "").replace(/,/g, "").trim())
    .refine((v) => v === "" || /^\d+$/.test(v), "الممشى رقم صحيح"),
  color: z.string().max(40).optional(),
  specs: z.string().max(500).optional(),
  vin: z.string().max(40).optional(),
  source: z.string().max(80).optional(),
  ownerName: z.string().max(100).optional(),
  ownerPhone: z.string().max(30).optional(),
  askingPrice: priceOpt,
  commissionType: z.enum(["FIXED", "PERCENT"]).optional(),
  commissionValue: priceOpt,
  notes: z.string().max(2000).optional(),
});

function parseCar(fd: FormData) {
  const v = carSchema.parse(formObject(fd));
  return {
    ...v,
    mileage: v.mileage ? Number(v.mileage) : null,
    askingPrice: v.askingPrice || null,
    commissionValue: v.commissionValue || null,
    marketPrices: fd.getAll("market").map(String),
  };
}

export async function createCarAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const res = await run(async () => {
    const type = fd.get("type") === "BROKERAGE" ? "BROKERAGE" : "PURCHASE";
    id = (await createCar(prisma, actorOf(user), { type, ...parseCar(fd) })).id;
  });
  if (!res.ok) return res;
  revalidatePath("/cars");
  redirect(`/cars/${id}`);
}

export async function updateCarAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    await updateCar(prisma, actorOf(user), String(fd.get("id")), parseCar(fd));
  });
  if (res.ok) revalidatePath("/cars");
  return res.ok ? { ok: true, message: "انحفظ" } : res;
}

export async function checklistAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    await setChecklist(prisma, actorOf(user), String(fd.get("id")), {
      inspection: fd.get("inspection") === "on",
      vinReport: fd.get("vinReport") === "on",
      noLiens: fd.get("noLiens") === "on",
      testDrive: fd.get("testDrive") === "on",
    });
  });
  if (res.ok) revalidatePath("/cars");
  return res.ok ? { ok: true, message: "انحفظ" } : res;
}

export async function buyCarAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ id: z.string(), price: moneyStr("سعر الشراء"), accountId: z.string().min(1), date: z.string().optional() }).parse(formObject(fd));
    await buyCar(prisma, actorOf(user), v.id, { price: v.price, accountId: v.accountId, date: entryDate(v.date), override: overrideOf(fd) });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "تسجّل الشراء ✓" } : res;
}

export async function carCostAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ id: z.string(), description: z.string().trim().min(1, "اكتب الوصف"), amount: moneyStr("المبلغ"), accountId: z.string().min(1), date: z.string().optional() }).parse(formObject(fd));
    await addCarCost(prisma, actorOf(user), v.id, { description: v.description, amount: v.amount, accountId: v.accountId, date: entryDate(v.date), override: overrideOf(fd) });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "تسجّلت التكلفة" } : res;
}

export async function sellCarAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ id: z.string(), price: moneyStr("سعر البيع"), accountId: z.string().min(1), buyerId: z.string().optional(), date: z.string().optional() }).parse(formObject(fd));
    await sellCar(prisma, actorOf(user), v.id, { price: v.price, accountId: v.accountId, buyerId: v.buyerId || null, date: entryDate(v.date) });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "تسجّل البيع ✓" } : res;
}

export async function cancelCarAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    await cancelCar(prisma, actorOf(user), String(fd.get("id")), String(fd.get("reason") ?? ""));
  });
  if (res.ok) revalidatePath("/cars");
  return res;
}

export async function carQuoteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let quoteId = "";
  const res = await run(async () => {
    const v = z
      .object({ id: z.string(), customerId: z.string().min(1, "اختر العميل"), price: moneyStr("السعر"), validityDays: z.coerce.number().int().min(1).max(60).default(3), terms: z.string().max(1000).optional() })
      .parse(formObject(fd));
    quoteId = (await createCarQuote(prisma, actorOf(user), v.id, { customerId: v.customerId, price: v.price, validityDays: v.validityDays, terms: v.terms })).id;
  });
  if (!res.ok) return res;
  revalidatePath("/quotes");
  redirect(`/quotes/${quoteId}`);
}
