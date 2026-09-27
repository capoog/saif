"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "../db";
import { actorOf, requireUser } from "../auth/session";
import { addAdSpend, createCampaign, deleteAdSpend, setCampaignActive } from "../services/ads";
import { entryDate, formObject, moneyStr, optionalMoneyStr, overrideOf, run, type ActionState } from "./run";

export async function createCampaignAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ name: z.string().trim().min(1, "اكتب اسم الحملة"), channel: z.string(), productId: z.string().optional(), engineId: z.string().optional() }).parse(formObject(fd));
    await createCampaign(prisma, actorOf(user), { ...v, productId: v.productId || null, engineId: v.engineId || null });
  });
  if (res.ok) revalidatePath("/ads");
  return res.ok ? { ok: true, message: "انضافت الحملة" } : res;
}

export async function addSpendAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z
      .object({
        campaignId: z.string(),
        amount: moneyStr("الإنفاق"),
        orders: z.coerce.number().int().min(0).default(0),
        revenue: optionalMoneyStr("الإيراد"),
        accountId: z.string().min(1),
        date: z.string().optional(),
      })
      .parse(formObject(fd));
    await addAdSpend(prisma, actorOf(user), { ...v, date: entryDate(v.date), override: overrideOf(fd) });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "تسجّل ✓" } : res;
}

export async function toggleCampaignAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    await setCampaignActive(prisma, actorOf(user), String(fd.get("id")), fd.get("active") === "1");
  });
  if (res.ok) revalidatePath("/ads");
  return res;
}

export async function deleteSpendAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    await deleteAdSpend(prisma, actorOf(user), String(fd.get("id")), String(fd.get("reason") || "إلغاء إنفاق إعلاني"));
  });
  if (res.ok) revalidatePath("/", "layout");
  return res;
}
