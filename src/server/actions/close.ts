"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db";
import { actorOf, requireUser } from "../auth/session";
import { closeWeek, reconcileAccount, updateSnapshotDecision } from "../services/close";
import { adjustStock } from "../services/inventory";
import { run, type ActionState } from "./run";

/** خطوة 1: مطابقة كل الحسابات النقدية (actual_<accountId>) */
export async function reconcileAllAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const diffs: { account: string; diff: string }[] = [];
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("actual_") || typeof v !== "string" || v.trim() === "") continue;
      const amount = v.replace(/,/g, "").trim();
      if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) return { ok: false, error: "رصيد غير صالح" };
      const r = await reconcileAccount(prisma, actorOf(user), k.slice(7), amount, new Date());
      if (!r.diff.isZero()) diffs.push({ account: r.account, diff: r.diff.toFixed(2) });
    }
    return { ok: true, message: diffs.length ? `تسجّلت فروقات: ${diffs.map((d) => `${d.account} ${d.diff}`).join("، ")}` : "كل الأرصدة مطابقة ✔", data: diffs };
  });
  revalidatePath("/", "layout");
  return res;
}

/** خطوة 2: جرد سريع (count_<productId>) */
export async function stockCountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const diffs: string[] = [];
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("count_") || typeof v !== "string" || v.trim() === "") continue;
      if (!/^\d+(\.\d{1,3})?$/.test(v.trim())) return { ok: false, error: "كمية غير صالحة" };
      const r = await adjustStock(prisma, actorOf(user), k.slice(6), v.trim(), new Date(), "جرد الإغلاق الأسبوعي");
      if (!r.diff.isZero()) diffs.push(`${r.diff.gt(0) ? "+" : ""}${r.diff.toString()}`);
    }
    return { ok: true, message: diffs.length ? `تسجّلت ${diffs.length} فروقات جرد` : "المخزون مطابق ✔" };
  });
  revalidatePath("/", "layout");
  return res;
}

export async function closeWeekAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let week = 0;
  const res = await run(async () => {
    const v = z
      .object({ actualDecision: z.string().max(2000).optional(), overwrite: z.string().optional(), reason: z.string().max(500).optional(), reconciliation: z.string().optional() })
      .parse(Object.fromEntries([...fd.entries()].filter(([, x]) => typeof x === "string")));
    let reconciliation: unknown;
    try {
      reconciliation = v.reconciliation ? JSON.parse(v.reconciliation) : undefined;
    } catch {
      reconciliation = undefined;
    }
    const snap = await closeWeek(prisma, actorOf(user), {
      actualDecision: v.actualDecision,
      overwrite: v.overwrite === "1",
      reason: v.reason,
      reconciliation,
    });
    week = snap.week;
  });
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  redirect(`/close/${week}`);
}

export async function updateDecisionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ week: z.coerce.number().int(), decision: z.string().max(2000), reason: z.string().min(1, "اكتب سبب التعديل") }).parse(Object.fromEntries(fd.entries()));
    await updateSnapshotDecision(prisma, actorOf(user), v.week, v.decision, v.reason);
  });
  if (res.ok) revalidatePath("/close");
  return res.ok ? { ok: true, message: "انحفظ التعديل" } : res;
}
