"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db";
import { actorOf, requireUser } from "../auth/session";
import { addProjectCost, collectInvoice, createInvoice, createProject, receiveAdvance, setGuaranteeMargin, setInvoiceStatus, updateProject } from "../services/projects";
import { dayAt, entryDate, formObject, moneyStr, optionalMoneyStr, overrideOf, run, type ActionState } from "./run";

const projectSchema = z.object({
  type: z.enum(["QUALIFICATION", "PRIVATE_SUPPLY", "GOV_TENDER", "SUBCONTRACT", "DIRECT_CONTRACT"]),
  name: z.string().trim().min(1, "اكتب اسم المشروع"),
  customerId: z.string().min(1, "اختر الجهة"),
  value: moneyStr("قيمة العقد"),
  advancePct: optionalMoneyStr("نسبة المقدمة"),
  bankGuarantee: optionalMoneyStr("الضمان البنكي"),
  expectedCollectionDays: z.coerce.number().int().min(0).max(720).default(60),
  startDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(["BIDDING", "ACTIVE", "COMPLETED", "LOST", "CANCELLED"]).optional(),
});

export async function saveProjectAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = String(fd.get("id") ?? "");
  const res = await run(async () => {
    const v = projectSchema.parse(formObject(fd));
    const input = { ...v, startDate: dayAt(v.startDate, 12) };
    if (id) await updateProject(prisma, actorOf(user), id, input);
    else id = (await createProject(prisma, actorOf(user), input)).id;
  });
  if (!res.ok) return res;
  revalidatePath("/projects");
  if (!fd.get("id")) redirect(`/projects/${id}`);
  return { ok: true, message: "انحفظ" };
}

export async function projectMoneyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ id: z.string(), kind: z.enum(["advance", "guarantee", "cost"]), amount: optionalMoneyStr("المبلغ"), accountId: z.string().min(1), category: z.string().optional(), note: z.string().optional(), date: z.string().optional() }).parse(formObject(fd));
    const date = entryDate(v.date);
    if (v.kind === "advance") await receiveAdvance(prisma, actorOf(user), v.id, { amount: v.amount, accountId: v.accountId, date });
    if (v.kind === "guarantee") await setGuaranteeMargin(prisma, actorOf(user), v.id, { amount: v.amount, accountId: v.accountId, date, override: overrideOf(fd) });
    if (v.kind === "cost") await addProjectCost(prisma, actorOf(user), v.id, { amount: v.amount, accountId: v.accountId, category: v.category || "EXP_OTHER", note: v.note, date, override: overrideOf(fd) });
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "تسجّل ✓" } : res;
}

export async function invoiceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const op = String(fd.get("op"));
    if (op === "create") {
      const v = z.object({ id: z.string(), amount: moneyStr("قيمة المستخلص"), note: z.string().optional(), date: z.string().optional() }).parse(formObject(fd));
      await createInvoice(prisma, actorOf(user), v.id, { amount: v.amount, date: entryDate(v.date), note: v.note });
    } else if (op === "SUBMITTED" || op === "APPROVED") {
      await setInvoiceStatus(prisma, actorOf(user), String(fd.get("invoiceId")), op);
    } else if (op === "collect") {
      const v = z.object({ invoiceId: z.string(), amount: moneyStr("المبلغ"), accountId: z.string().min(1) }).parse(formObject(fd));
      await collectInvoice(prisma, actorOf(user), v.invoiceId, { amount: v.amount, accountId: v.accountId, date: new Date() });
    }
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "تسجّل ✓" } : res;
}
