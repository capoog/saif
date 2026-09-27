"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db";
import { actorOf, requireUser } from "../auth/session";
import { createCustomer, createDeal, importCustomers, logActivity, moveDeal, setFollowUp, updateCustomer } from "../services/crm";
import { dayAt, formObject, run, type ActionState } from "./run";

const customerSchema = z.object({
  name: z.string().trim().min(1, "اكتب اسم العميل").max(150),
  type: z.enum(["individual", "company"]).default("individual"),
  phone: z.string().max(30).optional(),
  email: z.union([z.literal(""), z.email("إيميل غير صالح")]).optional(),
  city: z.string().max(60).optional(),
  sector: z.string().max(80).optional(),
  contact: z.string().max(120).optional(),
  channel: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
});

export async function createCustomerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const next = String(fd.get("next") ?? "");
  const res = await run(async () => {
    id = (await createCustomer(prisma, actorOf(user), customerSchema.parse(formObject(fd)))).id;
  });
  if (!res.ok) return res;
  revalidatePath("/customers");
  redirect(next === "quote" ? `/quotes/new?customerId=${id}` : next === "deal" ? `/crm/deals/new?customerId=${id}` : `/customers/${id}`);
}

export async function updateCustomerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    await updateCustomer(prisma, actorOf(user), String(fd.get("id")), customerSchema.parse(formObject(fd)));
  });
  if (res.ok) revalidatePath("/customers");
  return res.ok ? { ok: true, message: "انحفظ" } : res;
}

export async function importCustomersAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    const csv = String(fd.get("csv") ?? "");
    const r = await importCustomers(prisma, actorOf(user), csv);
    revalidatePath("/customers");
    return { ok: true, message: `انضاف ${r.created} عميل. متكرر (الجوال موجود): ${r.duplicates}. سطور من غير اسم: ${r.skipped}.` };
  });
}

export async function createDealAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z
      .object({
        customerId: z.string().min(1, "اختار العميل"),
        title: z.string().trim().min(1, "اكتب عنوان الصفقة"),
        engineId: z.string().optional(),
        stage: z.enum(["LEAD", "CONTACTED", "INTERESTED", "QUOTE_SENT", "NEGOTIATION"]).default("LEAD"),
        value: z.string().optional(),
        followUp: z.string().optional(),
        note: z.string().max(1000).optional(),
      })
      .parse(formObject(fd));
    const value = v.value?.replace(/,/g, "").trim();
    await createDeal(prisma, actorOf(user), {
      customerId: v.customerId,
      title: v.title,
      engineId: v.engineId || null,
      stage: v.stage,
      value: value && /^\d+(\.\d{1,2})?$/.test(value) ? value : null,
      nextFollowUpAt: dayAt(v.followUp),
      note: v.note || null,
    });
  });
  if (!res.ok) return res;
  revalidatePath("/crm");
  redirect("/crm");
}

export async function moveDealAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z
      .object({ id: z.string(), stage: z.enum(["LEAD", "CONTACTED", "INTERESTED", "QUOTE_SENT", "NEGOTIATION", "DEPOSIT", "WON", "LOST"]), lostReason: z.string().optional() })
      .parse(formObject(fd));
    await moveDeal(prisma, actorOf(user), v.id, v.stage, v.lostReason);
  });
  if (res.ok) revalidatePath("/crm");
  return res;
}

export async function followUpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const id = String(fd.get("id"));
    const done = fd.get("done") === "1";
    // "تواصلت": يتسجل تواصل، والمتابعة الجاية على التاريخ الجديد
    if (done) await logActivity(prisma, actorOf(user), { type: String(fd.get("type") || "call"), dealId: id, note: String(fd.get("note") ?? "") || null, nextFollowUpAt: dayAt(String(fd.get("followUp") ?? ""))});
    else await setFollowUp(prisma, actorOf(user), id, dayAt(String(fd.get("followUp") ?? "")));
  });
  if (res.ok) revalidatePath("/crm");
  return res.ok ? { ok: true, message: "تسجّل" } : res;
}

export async function logActivityAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z
      .object({
        type: z.string().default("call"),
        count: z.coerce.number().int().min(1).max(100).default(1),
        customerId: z.string().optional(),
        dealId: z.string().optional(),
        note: z.string().max(500).optional(),
      })
      .parse(formObject(fd));
    const r = await logActivity(prisma, actorOf(user), { type: v.type, count: v.count, customerId: v.customerId || null, dealId: v.dealId || null, note: v.note || null });
    return { ok: true, message: `+${r.count} تواصل` };
  });
  if (res.ok) revalidatePath("/", "layout");
  return res;
}
