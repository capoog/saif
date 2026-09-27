"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "../db";
import { actorOf, requireUser } from "../auth/session";
import { createUser, updateUser } from "../services/users";
import { createTransaction } from "../services/transactions";
import { entryDate, formObject, moneyStr, overrideOf, run, type ActionState } from "./run";

const pct = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim())
  .refine((v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) <= 50), "نسبة العمولة غير صالحة");

export async function createUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z
      .object({
        name: z.string().trim().min(1, "اكتب الاسم"),
        email: z.email("إيميل غير صالح"),
        password: z.string().min(10, "كلمة المرور 10 حروف على الأقل"),
        role: z.enum(["sales", "freelancer"]),
        commissionPct: pct,
        freelancerId: z.string().optional(),
      })
      .parse(formObject(fd));
    await createUser(prisma, actorOf(user), { ...v, commissionPct: v.commissionPct || null, freelancerId: v.freelancerId || null });
  });
  if (res.ok) revalidatePath("/settings");
  return res.ok ? { ok: true, message: "انضاف الحساب — عطه الإيميل وكلمة المرور" } : res;
}

export async function updateUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ id: z.string(), active: z.enum(["0", "1"]).optional(), commissionPct: pct, password: z.string().optional() }).parse(formObject(fd));
    await updateUser(prisma, actorOf(user), v.id, {
      active: v.active === undefined ? undefined : v.active === "1",
      commissionPct: fd.has("commissionPct") ? v.commissionPct || null : undefined,
      password: v.password || undefined,
    });
  });
  if (res.ok) revalidatePath("/settings");
  return res.ok ? { ok: true, message: "انحفظ" } : res;
}

export async function payCommissionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ salesUserId: z.string(), amount: moneyStr("المبلغ"), accountId: z.string().min(1), date: z.string().optional() }).parse(formObject(fd));
    await createTransaction(prisma, actorOf(user), {
      type: "WITHDRAWAL",
      category: "COMMISSION_PAYMENT",
      salesUserId: v.salesUserId,
      amount: v.amount,
      accountId: v.accountId,
      date: entryDate(v.date),
      override: overrideOf(fd),
    });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "تسجّل السداد" } : res;
}
