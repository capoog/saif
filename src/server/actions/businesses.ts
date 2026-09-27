"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db";
import { actorOf, requireUser } from "../auth/session";
import { createBusiness, quickSale, updateBusiness } from "../services/businesses";
import { formObject, run, type ActionState } from "./run";

const schema = z.object({
  name: z.string().trim().min(1, "اكتب اسم النشاط").max(60),
  kind: z.string().min(1, "اختر النوع"),
  maxCapitalPct: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export async function createBusinessAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const res = await run(async () => {
    id = (await createBusiness(prisma, actorOf(user), schema.parse(formObject(fd)))).id;
  });
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  redirect(`/businesses/${id}`);
}

export async function updateBusinessAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const id = String(fd.get("id"));
    if (fd.get("toggle")) {
      await updateBusiness(prisma, actorOf(user), id, { active: fd.get("toggle") === "on" });
      return;
    }
    await updateBusiness(prisma, actorOf(user), id, schema.parse(formObject(fd)));
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "انحفظ" } : res;
}

export async function quickSaleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let number = 0;
  const res = await run(async () => {
    const v = z
      .object({
        engineId: z.string().min(1),
        method: z.string().min(1),
        discount: z.string().optional(),
        items: z.string().transform((s) => z.array(z.object({ productId: z.string(), quantity: z.number().int().positive() })).parse(JSON.parse(s))),
      })
      .parse(formObject(fd));
    const order = await quickSale(prisma, actorOf(user), { engineId: v.engineId, method: v.method, discount: v.discount || undefined, items: v.items });
    number = order.number;
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: `انسجل البيع ✓ طلب رقم ${number}`, data: number } : res;
}
