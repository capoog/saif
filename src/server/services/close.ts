import { Prisma } from "@prisma/client";
import type { CapitalBreakdown } from "@/domain/capital";
import { monthlyZakat } from "@/domain/capital";
import { D, Decimal, round2, toDb2, ZERO } from "@/domain/money";
import { planWeek, riyadhDateKey, riyadhEndOfDay, riyadhStartOfDay, weekRange } from "@/domain/plan-calendar";
import { compareToTarget, suggestDecision, type CapitalStatus, type EngineWeekResult } from "@/domain/status";
import type { Db, Tx } from "../db";
import { audit, toJson, type Actor } from "../audit";
import { UserError } from "../errors";
import { postEntry } from "../ledger";
import { accountBalance, customerBalances, getCapital } from "./balances";
import { getSettings } from "./settings";

/** ربح كل محرك في فترة = إيراداته − (تكلفة بضاعة + مصروفات) المنسوبة له */
export async function engineProfits(db: Db | Tx, from: Date, to: Date): Promise<Map<string, Decimal>> {
  const rows = await db.$queryRaw<{ engineId: string | null; profit: Prisma.Decimal }[]>`
    SELECT l."engineId" AS "engineId",
           SUM(l."credit" - l."debit") AS "profit"
    FROM "JournalLine" l
    JOIN "JournalEntry" e ON e."id" = l."entryId"
    JOIN "LedgerAccount" a ON a."id" = l."accountId"
    WHERE a."type" IN ('INCOME', 'EXPENSE') AND e."date" >= ${from} AND e."date" <= ${to}
    GROUP BY l."engineId"`;
  return new Map(rows.map((r) => [r.engineId ?? "", D(r.profit)]));
}

/** رأس المال المستخدم في كل محرك = مخزونه بالتكلفة + ذممه المضمونة */
export async function engineCapitalUsed(db: Db | Tx, asOf: Date): Promise<Map<string, Decimal>> {
  const settings = await getSettings(db);
  const inv = await db.$queryRaw<{ engineId: string; value: Prisma.Decimal }[]>`
    SELECT l."engineId" AS "engineId", SUM(l."debit" - l."credit") AS "value"
    FROM "JournalLine" l
    JOIN "JournalEntry" e ON e."id" = l."entryId"
    JOIN "LedgerAccount" a ON a."id" = l."accountId"
    WHERE a."kind" = 'INVENTORY' AND e."date" <= ${asOf} AND l."engineId" IS NOT NULL
    GROUP BY l."engineId"`;
  const map = new Map(inv.map((r) => [r.engineId, D(r.value)]));
  for (const cb of await customerBalances(db, asOf)) {
    if (cb.balance.lte(0)) continue;
    const age = (asOf.getTime() - cb.dueFrom.getTime()) / 86400000;
    if (age > settings.receivableSecuredDays) continue;
    map.set(cb.engineId, (map.get(cb.engineId) ?? ZERO).plus(cb.balance));
  }
  return map;
}

export async function engineWeekResults(db: Db | Tx, week: number, asOf: Date): Promise<EngineWeekResult[]> {
  const { startKey, endKey } = weekRange(week);
  const from = riyadhStartOfDay(startKey);
  const to = new Date(Math.min(riyadhEndOfDay(endKey).getTime(), asOf.getTime()));
  const [engines, profits, used] = await Promise.all([
    db.engine.findMany({ orderBy: { sortOrder: "asc" } }),
    engineProfits(db, from, to),
    engineCapitalUsed(db, asOf),
  ]);
  return engines.map((e) => {
    const profit = round2(profits.get(e.id) ?? ZERO);
    const capitalUsed = round2(used.get(e.id) ?? ZERO);
    return {
      code: e.code,
      name: e.name,
      profit,
      capitalUsed,
      returnPct: capitalUsed.gt(0) ? round2(profit.div(capitalUsed).times(100)) : null,
    };
  });
}

/** مخصص الزكاة الشهري (مرة واحدة لكل شهر). تقديري — الحساب الرسمي مع المحاسب. */
export async function accrueZakatIfNeeded(db: Db, actor: Actor, asOf: Date) {
  const month = riyadhDateKey(asOf).slice(0, 7);
  const exists = await db.zakatAccrual.findUnique({ where: { month } });
  if (exists) return exists;
  const settings = await getSettings(db);
  const cap = await getCapital(db, asOf);
  const amount = monthlyZakat(cap.capital, settings.zakatAnnualRatePct);
  return db.$transaction(async (tx) => {
    const accrual = await tx.zakatAccrual.create({ data: { month, base: toDb2(cap.capital), amount: toDb2(amount) } });
    if (amount.gt(0)) {
      const entry = await postEntry(tx, {
        date: asOf,
        description: `مخصص زكاة تقديري — ${month}`,
        sourceType: "ZAKAT",
        sourceId: accrual.id,
        createdById: actor.userId,
        lines: [
          { accountCode: "EXP_ZAKAT", debit: amount },
          { accountCode: "ZAKAT_PROVISION", credit: amount },
        ],
      });
      await tx.zakatAccrual.update({ where: { id: accrual.id }, data: { journalEntryId: entry.id } });
    }
    await audit(tx, actor, "create", "ZakatAccrual", accrual.id, { after: accrual });
    return accrual;
  });
}

/** مطابقة رصيد حساب نقدي مع الرصيد الفعلي. الفرق يتسجل في "فروقات مطابقة". */
export async function reconcileAccount(db: Db, actor: Actor, accountId: string, actual: string, date: Date) {
  return db.$transaction(async (tx) => {
    const acct = await tx.ledgerAccount.findUniqueOrThrow({ where: { id: accountId } });
    if (!acct.isMoney) throw new UserError("الحساب مش نقدي");
    const system = await accountBalance(tx, accountId);
    const diff = round2(D(actual).minus(system));
    if (diff.isZero()) return { account: acct.name, system, actual: D(actual), diff };
    await postEntry(tx, {
      date,
      description: `مطابقة رصيد ${acct.name}`,
      sourceType: "RECONCILE",
      sourceId: accountId,
      createdById: actor.userId,
      lines: diff.gt(0)
        ? [
            { accountCode: acct.code, debit: diff },
            { accountCode: "EXP_RECON", credit: diff },
          ]
        : [
            { accountCode: "EXP_RECON", debit: diff.neg() },
            { accountCode: acct.code, credit: diff.neg() },
          ],
    });
    await audit(tx, actor, "reconcile", "LedgerAccount", accountId, { before: { system }, after: { actual }, reason: `فرق ${diff}` });
    return { account: acct.name, system, actual: D(actual), diff };
  });
}

export interface CloseDraft {
  week: number;
  asOf: Date;
  breakdown: CapitalBreakdown;
  target: Decimal;
  gap: Decimal;
  gapPct: Decimal;
  status: CapitalStatus;
  engines: EngineWeekResult[];
  suggestedDecision: string;
}

export async function closeDraft(db: Db | Tx, asOf: Date = new Date(), week?: number): Promise<CloseDraft> {
  const w = week ?? planWeek(asOf);
  const [settings, target, breakdown, engines] = await Promise.all([
    getSettings(db),
    db.weeklyTarget.findUnique({ where: { week: w } }),
    getCapital(db, asOf),
    engineWeekResults(db, w, asOf),
  ]);
  if (!target) throw new UserError(`مفيش هدف للأسبوع ${w}`);
  const cmp = compareToTarget(breakdown.capital, target.endCapitalTarget, settings);
  return {
    week: w,
    asOf,
    breakdown,
    target: D(target.endCapitalTarget),
    ...cmp,
    engines,
    suggestedDecision: suggestDecision({ status: cmp.status, gap: cmp.gap, engines, settings }),
  };
}

/** حفظ Snapshot الأسبوع. بعد الحفظ مفيش تعديل غير للـ owner مع سبب (overwrite=true). */
export async function closeWeek(
  db: Db,
  actor: Actor & { role?: string },
  opts: { asOf?: Date; week?: number; actualDecision?: string; reconciliation?: unknown; overwrite?: boolean; reason?: string },
) {
  const asOf = opts.asOf ?? new Date();
  const week = opts.week ?? planWeek(asOf);
  const existing = await db.weeklySnapshot.findUnique({ where: { week } });
  if (existing && !opts.overwrite) throw new UserError(`أسبوع ${week} متقفل بالفعل`);
  if (existing && (actor.role !== "owner" || !opts.reason?.trim())) throw new UserError("تعديل إغلاق محفوظ يحتاج صلاحية المالك وسبب");

  await accrueZakatIfNeeded(db, actor, asOf);
  const draft = await closeDraft(db, asOf, week);
  const data = {
    asOf,
    capital: toDb2(draft.breakdown.capital),
    target: toDb2(draft.target),
    gap: toDb2(draft.gap),
    gapPct: draft.gapPct.toFixed(4),
    status: draft.status,
    breakdown: toJson(draft.breakdown),
    engines: toJson(draft.engines),
    suggestedDecision: draft.suggestedDecision,
    actualDecision: opts.actualDecision ?? null,
    reconciliation: opts.reconciliation === undefined ? undefined : toJson(opts.reconciliation),
    closedById: actor.userId,
  };
  return db.$transaction(async (tx) => {
    const snap = existing
      ? await tx.weeklySnapshot.update({ where: { week }, data })
      : await tx.weeklySnapshot.create({ data: { week, ...data } });
    await audit(tx, actor, existing ? "reopen" : "close", "WeeklySnapshot", String(week), {
      before: existing ?? undefined,
      after: snap,
      reason: opts.reason,
    });
    return snap;
  });
}

export async function updateSnapshotDecision(db: Db, actor: Actor & { role?: string }, week: number, decision: string, reason: string) {
  if (actor.role !== "owner" || !reason.trim()) throw new UserError("التعديل يحتاج صلاحية المالك وسبب");
  return db.$transaction(async (tx) => {
    const before = await tx.weeklySnapshot.findUniqueOrThrow({ where: { week } });
    const snap = await tx.weeklySnapshot.update({ where: { week }, data: { actualDecision: decision } });
    await audit(tx, actor, "update", "WeeklySnapshot", String(week), { before: { actualDecision: before.actualDecision }, after: { actualDecision: decision }, reason });
    return snap;
  });
}
