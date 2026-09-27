"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "../db";
import { actorOf, requireUser } from "../auth/session";
import { mapSku, retryExternalOrder } from "../services/store-sync";
import { formObject, run, type ActionState } from "./run";

export async function mapSkuAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let n = 0;
  const res = await run(async () => {
    const v = z.object({ sku: z.string().min(1), productId: z.string().min(1, "اختر المنتج") }).parse(formObject(fd));
    n = await mapSku(prisma, actorOf(user), v.sku, v.productId);
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: `انربط ✓ وانعاد ${n} طلب` } : res;
}

export async function retryExternalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const ext = await retryExternalOrder(prisma, String(fd.get("id")), actorOf(user));
    if (ext.status === "ERROR") return { ok: false, error: ext.error ?? "ما زبط" };
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "تمت المزامنة ✓" } : res;
}
