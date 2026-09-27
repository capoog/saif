"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db";
import { actorOf, requireUser } from "../auth/session";
import { createTransaction, deleteTransaction } from "../services/transactions";
import { entryDate, formObject, moneyStr, overrideOf, run, type ActionState } from "./run";

const schema = z.object({
  type: z.enum(["DEPOSIT", "WITHDRAWAL", "TRANSFER", "EXPENSE"], { error: "نوع الحركة غير صالح" }),
  amount: moneyStr("المبلغ"),
  accountId: z.string().min(1, "اختار الحساب"),
  toAccountId: z.string().optional(),
  category: z.string().optional(),
  engineId: z.string().optional(),
  date: z.string().optional(),
  note: z.string().max(300).optional(),
  again: z.string().optional(),
  supplierId: z.string().optional(),
  override: z.string().optional(),
});

export async function createTransactionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let again = false;
  const res = await run(async () => {
    const v = schema.parse(formObject(fd));
    again = v.again === "1";
    await createTransaction(prisma, actorOf(user), {
      type: v.type,
      amount: v.amount,
      accountId: v.accountId,
      toAccountId: v.toAccountId || null,
      category: v.category || null,
      engineId: v.engineId || null,
      date: entryDate(v.date),
      note: v.note || null,
      supplierId: v.supplierId || null,
      override: overrideOf(fd),
    });
  });
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  if (again) return { ok: true, message: "تسجّلت ✔ — سجّل التالية" };
  redirect("/accounts");
}

export async function deleteTransactionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    await deleteTransaction(prisma, actorOf(user), String(fd.get("id")), String(fd.get("reason") ?? ""));
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "انلغت الحركة" } : res;
}
