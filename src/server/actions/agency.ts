"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "../db";
import { actorOf, requireUser } from "../auth/session";
import { UserError } from "../errors";
import { approveTask, chargeSubscription, createSubscription, createTask, freelancerUpdateTask, ownerSetTaskStatus, saveFreelancer, updateSubscription } from "../services/agency";
import { createTransaction } from "../services/transactions";
import { dayAt, entryDate, formObject, moneyStr, optionalMoneyStr, overrideOf, run, type ActionState } from "./run";

export async function saveFreelancerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z
      .object({ id: z.string().optional(), name: z.string().trim().min(1, "اكتب الاسم"), phone: z.string().optional(), skills: z.string().optional(), rateNote: z.string().optional(), notes: z.string().optional(), active: z.enum(["0", "1"]).optional() })
      .parse(formObject(fd));
    await saveFreelancer(prisma, actorOf(user), { ...v, id: v.id || undefined, active: v.active === undefined ? undefined : v.active === "1" });
  });
  if (res.ok) revalidatePath("/agency");
  return res.ok ? { ok: true, message: "انحفظ" } : res;
}

export async function payFreelancerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ freelancerId: z.string(), amount: moneyStr("المبلغ"), accountId: z.string().min(1), date: z.string().optional() }).parse(formObject(fd));
    await createTransaction(prisma, actorOf(user), { type: "WITHDRAWAL", category: "FREELANCER_PAYMENT", freelancerId: v.freelancerId, amount: v.amount, accountId: v.accountId, date: entryDate(v.date), override: overrideOf(fd) });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "تسجّل السداد" } : res;
}

export async function createSubscriptionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ customerId: z.string().min(1, "اختر العميل"), service: z.string().trim().min(1, "اكتب الخدمة"), amount: moneyStr("القيمة"), startDate: z.string().min(1, "حدد تاريخ البداية"), notes: z.string().optional() }).parse(formObject(fd));
    await createSubscription(prisma, actorOf(user), { ...v, startDate: dayAt(v.startDate, 12)! });
  });
  if (res.ok) revalidatePath("/agency");
  return res.ok ? { ok: true, message: "انضاف الاشتراك" } : res;
}

export async function chargeSubscriptionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const id = String(fd.get("id"));
    const paid = fd.get("paid") === "1";
    const accountId = String(fd.get("accountId") ?? "");
    if (paid && !accountId) throw new UserError("اختر الحساب");
    await chargeSubscription(prisma, actorOf(user), id, { date: new Date(), payment: paid ? { accountId, method: "transfer" } : null });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "تسجّل اشتراك الشهر ✓" } : res;
}

export async function subscriptionStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ id: z.string(), status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional(), amount: optionalMoneyStr("القيمة"), nextBillingDate: z.string().optional() }).parse(formObject(fd));
    await updateSubscription(prisma, actorOf(user), v.id, {
      status: v.status,
      amount: fd.has("amount") && v.amount !== "0" ? v.amount : undefined,
      nextBillingDate: v.nextBillingDate ? dayAt(v.nextBillingDate, 12)! : undefined,
    });
  });
  if (res.ok) revalidatePath("/agency");
  return res.ok ? { ok: true, message: "انحفظ" } : res;
}

export async function createTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z
      .object({ customerId: z.string().min(1, "اختر العميل"), subscriptionId: z.string().optional(), title: z.string().trim().min(1, "اكتب المهمة"), description: z.string().optional(), dueAt: z.string().optional(), freelancerId: z.string().optional(), cost: optionalMoneyStr("التكلفة") })
      .parse(formObject(fd));
    await createTask(prisma, actorOf(user), { ...v, dueAt: dayAt(v.dueAt, 18), freelancerId: v.freelancerId || null, subscriptionId: v.subscriptionId || null });
  });
  if (res.ok) revalidatePath("/agency");
  return res.ok ? { ok: true, message: "انضافت المهمة" } : res;
}

export async function ownerTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const id = String(fd.get("id"));
    const to = String(fd.get("to"));
    if (to === "APPROVED") await approveTask(prisma, actorOf(user), id);
    else if (to === "TODO" || to === "IN_PROGRESS" || to === "CANCELLED") await ownerSetTaskStatus(prisma, actorOf(user), id, to);
    else throw new UserError("حالة غير صالحة");
  });
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

/** المستقل: بدأت / سلّمت — على مهامه بس */
export async function freelancerTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["freelancer"]);
  const res = await run(async () => {
    if (!user.freelancerId) throw new UserError("حسابك مو مربوط بمستقل");
    const to = fd.get("to") === "DELIVERED" ? "DELIVERED" : "IN_PROGRESS";
    await freelancerUpdateTask(prisma, actorOf(user), user.freelancerId, String(fd.get("id")), to, { url: String(fd.get("url") ?? ""), note: String(fd.get("note") ?? "") });
  });
  if (res.ok) revalidatePath("/tasks");
  return res.ok ? { ok: true, message: "انحفظ ✓" } : res;
}
