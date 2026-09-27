import type { Prisma, SubscriptionStatus, TaskStatus } from "@prisma/client";
import { D, Decimal, round2, sum, toDb2, ZERO, type DecimalLike } from "@/domain/money";
import { addDaysKey, planDay, riyadhDateKey, riyadhEndOfDay, riyadhStartOfDay } from "@/domain/plan-calendar";
import type { Settings } from "@/domain/settings";
import type { Db, Tx } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import { postEntry } from "../ledger";
import { AGENCY_SERVICE_NAME } from "../chart";
import { createOrderTx } from "./orders";
import { getSettings } from "./settings";

// ─────────────── المستقلين ───────────────

export async function saveFreelancer(db: Db, actor: Actor, input: { id?: string; name: string; phone?: string | null; skills?: string | null; rateNote?: string | null; notes?: string | null; active?: boolean }) {
  if (!input.name?.trim()) throw new UserError("اكتب اسم المستقل");
  const data = {
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    skills: input.skills?.trim() || null,
    rateNote: input.rateNote?.trim() || null,
    notes: input.notes?.trim() || null,
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
  return db.$transaction(async (tx) => {
    const f = input.id ? await tx.freelancer.update({ where: { id: input.id }, data }) : await tx.freelancer.create({ data });
    await audit(tx, actor, input.id ? "update" : "create", "Freelancer", f.id, { after: f });
    return f;
  });
}

/** مستحقات كل مستقل (تكلفة المهام المعتمدة − المدفوع) */
export async function freelancerBalances(db: Db | Tx): Promise<Map<string, { accrued: Decimal; paid: Decimal; due: Decimal }>> {
  const rows = await db.$queryRaw<{ fid: string; accrued: Prisma.Decimal; paid: Prisma.Decimal }[]>`
    SELECT l."freelancerId" AS fid, SUM(l."credit") AS accrued, SUM(l."debit") AS paid
    FROM "JournalLine" l JOIN "LedgerAccount" a ON a."id" = l."accountId"
    WHERE a."code" = 'FREELANCERS' AND l."freelancerId" IS NOT NULL
    GROUP BY l."freelancerId"`;
  return new Map(rows.map((r) => [r.fid, { accrued: D(r.accrued), paid: D(r.paid), due: D(r.accrued).minus(D(r.paid)) }]));
}

// ─────────────── الاشتراكات ───────────────

/** نفس اليوم في الشهر الجاي (لو الشهر أقصر → آخر يوم فيه) */
export function nextMonth(d: Date): Date {
  const key = riyadhDateKey(d);
  const [y, m, day] = key.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nk = `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
  return new Date(riyadhStartOfDay(nk).getTime() + 12 * 3600000);
}

export async function createSubscription(db: Db, actor: Actor, input: { customerId: string; service: string; amount: DecimalLike; startDate: Date; notes?: string | null }) {
  if (!input.service?.trim()) throw new UserError("اكتب الخدمة");
  if (D(input.amount).lte(0)) throw new UserError("قيمة الاشتراك لازم تكون أكبر من صفر");
  return db.$transaction(async (tx) => {
    const s = await tx.subscription.create({
      data: { customerId: input.customerId, service: input.service.trim(), amount: toDb2(input.amount), startDate: input.startDate, nextBillingDate: input.startDate, notes: input.notes ?? null },
    });
    await audit(tx, actor, "create", "Subscription", s.id, { after: s });
    return s;
  });
}

export async function updateSubscription(db: Db, actor: Actor, id: string, patch: { status?: SubscriptionStatus; amount?: DecimalLike; nextBillingDate?: Date }) {
  return db.$transaction(async (tx) => {
    const before = await tx.subscription.findUniqueOrThrow({ where: { id } });
    const s = await tx.subscription.update({
      where: { id },
      data: { status: patch.status, amount: patch.amount !== undefined ? toDb2(patch.amount) : undefined, nextBillingDate: patch.nextBillingDate },
    });
    await audit(tx, actor, "update", "Subscription", id, { before, after: s });
    return s;
  });
}

/**
 * تسجيل اشتراك الشهر: طلب خدمة مسلّم (إيراد لمحرك الوكالة + ذمة لين التحصيل)،
 * والتجديد الجاي بعد شهر. الشهر ما يتسجل مرتين.
 */
export async function chargeSubscription(db: Db, actor: Actor, id: string, opts: { date: Date; payment?: { accountId: string; method: string } | null }) {
  const settings = await getSettings(db);
  return db.$transaction(async (tx) => {
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id } });
    if (sub.status !== "ACTIVE") throw new UserError("الاشتراك مو نشط");
    // ما يتسجل شهر قبل موعده
    if (sub.nextBillingDate > riyadhEndOfDay(riyadhDateKey(opts.date))) {
      throw new UserError(`الاشتراك الجاي موعده ${riyadhDateKey(sub.nextBillingDate)}`);
    }
    const period = riyadhDateKey(sub.nextBillingDate).slice(0, 7);
    if (await tx.subscriptionCharge.findUnique({ where: { subscriptionId_period: { subscriptionId: id, period } } })) {
      throw new UserError(`اشتراك ${period} مسجّل قبل`);
    }
    const product = await tx.product.findFirst({ where: { kind: "SERVICE", name: AGENCY_SERVICE_NAME } });
    const agency = await tx.engine.findUniqueOrThrow({ where: { code: "AGENCY" } });
    if (!product) throw new UserError("منتج خدمة الوكالة مو موجود — شغّل البيانات الأولية");
    const order = await createOrderTx(
      tx,
      actor,
      {
        date: opts.date,
        customerId: sub.customerId,
        channel: "وكالة",
        engineId: agency.id,
        status: "DELIVERED",
        items: [{ productId: product.id, quantity: 1, unitPrice: sub.amount.toString() }],
        paymentMethod: opts.payment?.method ?? null,
        payment: opts.payment ? { amount: "FULL", method: opts.payment.method, accountId: opts.payment.accountId, date: opts.date } : null,
        note: `${sub.service} — ${period}`,
      },
      settings,
    );
    const charge = await tx.subscriptionCharge.create({ data: { subscriptionId: id, period, date: opts.date, amount: sub.amount, orderId: order.id } });
    await tx.subscription.update({ where: { id }, data: { nextBillingDate: nextMonth(sub.nextBillingDate) } });
    await audit(tx, actor, "charge", "Subscription", id, { after: { period, orderId: order.id } });
    return { charge, order };
  });
}

// ─────────────── المهام ───────────────

export async function createTask(
  db: Db,
  actor: Actor,
  input: { customerId: string; subscriptionId?: string | null; title: string; description?: string | null; dueAt?: Date | null; freelancerId?: string | null; cost?: DecimalLike },
) {
  if (!input.title?.trim()) throw new UserError("اكتب عنوان المهمة");
  const cost = round2(D(input.cost ?? 0));
  if (cost.lt(0)) throw new UserError("التكلفة لا تكون سالبة");
  if (cost.gt(0) && !input.freelancerId) throw new UserError("التكلفة للمستقل — اختر المستقل");
  return db.$transaction(async (tx) => {
    const t = await tx.agencyTask.create({
      data: {
        customerId: input.customerId,
        subscriptionId: input.subscriptionId || null,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        dueAt: input.dueAt ?? null,
        freelancerId: input.freelancerId || null,
        cost: toDb2(cost),
      },
    });
    await audit(tx, actor, "create", "AgencyTask", t.id, { after: t });
    return t;
  });
}

/** المستقل: يبدأ أو يسلّم مهامه بس */
export async function freelancerUpdateTask(db: Db, actor: Actor, freelancerId: string, taskId: string, to: Extract<TaskStatus, "IN_PROGRESS" | "DELIVERED">, delivery?: { url?: string | null; note?: string | null }) {
  return db.$transaction(async (tx) => {
    const t = await tx.agencyTask.findFirst({ where: { id: taskId, freelancerId } });
    if (!t) throw new UserError("المهمة مو لك");
    if (t.status === "APPROVED" || t.status === "CANCELLED") throw new UserError("المهمة مقفلة");
    if (to === "DELIVERED" && !delivery?.url?.trim() && !delivery?.note?.trim()) throw new UserError("حط رابط الشغل أو ملاحظة التسليم");
    const saved = await tx.agencyTask.update({
      where: { id: taskId },
      data: to === "DELIVERED" ? { status: "DELIVERED", deliveredAt: new Date(), deliveryUrl: delivery?.url?.trim() || null, deliveryNote: delivery?.note?.trim() || null } : { status: "IN_PROGRESS" },
    });
    await audit(tx, actor, "status", "AgencyTask", taskId, { before: { status: t.status }, after: { status: to } });
    return saved;
  });
}

/** المالك يعتمد التسليم: تكلفة المهمة تصير مستحقة للمستقل ومصروف على محرك الوكالة */
export async function approveTask(db: Db, actor: Actor, taskId: string, date = new Date()) {
  return db.$transaction(async (tx) => {
    const t = await tx.agencyTask.findUniqueOrThrow({ where: { id: taskId } });
    if (t.status === "APPROVED") throw new UserError("اعتمدتها قبل");
    if (t.status === "CANCELLED") throw new UserError("المهمة ملغية");
    const agency = await tx.engine.findUniqueOrThrow({ where: { code: "AGENCY" } });
    let journalEntryId: string | null = null;
    if (D(t.cost).gt(0) && t.freelancerId) {
      const e = await postEntry(tx, {
        date,
        description: `تنفيذ: ${t.title}`,
        sourceType: "AGENCY_TASK",
        sourceId: t.id,
        createdById: actor.userId,
        lines: [
          { accountCode: "EXP_FREELANCE", debit: t.cost, engineId: agency.id },
          { accountCode: "FREELANCERS", credit: t.cost, freelancerId: t.freelancerId },
        ],
      });
      journalEntryId = e.id;
    }
    const saved = await tx.agencyTask.update({ where: { id: taskId }, data: { status: "APPROVED", approvedAt: date, journalEntryId, deliveredAt: t.deliveredAt ?? date } });
    await audit(tx, actor, "approve", "AgencyTask", taskId, { after: { cost: t.cost } });
    return saved;
  });
}

export async function ownerSetTaskStatus(db: Db, actor: Actor, taskId: string, to: Extract<TaskStatus, "TODO" | "IN_PROGRESS" | "CANCELLED">) {
  return db.$transaction(async (tx) => {
    const t = await tx.agencyTask.findUniqueOrThrow({ where: { id: taskId } });
    if (t.status === "APPROVED") throw new UserError("المهمة معتمدة — ما تتغير");
    const saved = await tx.agencyTask.update({ where: { id: taskId }, data: { status: to } });
    await audit(tx, actor, "status", "AgencyTask", taskId, { before: { status: t.status }, after: { status: to } });
    return saved;
  });
}

// ─────────────── الأرقام ───────────────

export function monthRange(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: riyadhStartOfDay(`${monthKey}-01`), to: riyadhEndOfDay(`${monthKey}-${String(last).padStart(2, "0")}`) };
}

/** هامش كل عميل في الشهر = إيراد اشتراكاته (بدون ضريبة) − تكلفة مهامه المعتمدة */
export async function clientMargins(db: Db | Tx, monthKey: string, s: Pick<Settings, "agencyMinMarginPct">) {
  const { from, to } = monthRange(monthKey);
  const [charges, tasks] = await Promise.all([
    db.subscriptionCharge.findMany({
      where: { date: { gte: from, lte: to } },
      include: { subscription: { include: { customer: { select: { id: true, name: true } } } } },
    }),
    db.agencyTask.findMany({ where: { status: "APPROVED", approvedAt: { gte: from, lte: to } }, select: { customerId: true, cost: true } }),
  ]);
  const orderIds = charges.map((c) => c.orderId);
  const orders = await db.order.findMany({ where: { id: { in: orderIds }, status: "DELIVERED" }, select: { id: true, netRevenue: true } });
  const net = new Map(orders.map((o) => [o.id, D(o.netRevenue)]));
  const map = new Map<string, { customerId: string; name: string; revenue: Decimal; cost: Decimal }>();
  for (const c of charges) {
    const cust = c.subscription.customer;
    const e = map.get(cust.id) ?? { customerId: cust.id, name: cust.name, revenue: ZERO, cost: ZERO };
    e.revenue = e.revenue.plus(net.get(c.orderId) ?? ZERO);
    map.set(cust.id, e);
  }
  for (const t of tasks) {
    const e = map.get(t.customerId);
    if (e) e.cost = e.cost.plus(D(t.cost));
  }
  return [...map.values()].map((e) => {
    const marginPct = e.revenue.gt(0) ? round2(e.revenue.minus(e.cost).div(e.revenue).times(100)) : null;
    return { ...e, revenue: round2(e.revenue), cost: round2(e.cost), profit: round2(e.revenue.minus(e.cost)), marginPct, low: marginPct !== null && marginPct.lt(s.agencyMinMarginPct) };
  });
}

/** MRR وعدد العملاء مقابل الهدف: 5 عند اليوم 60، 15 عند 120، 25 عند 229 */
export async function agencyOverview(db: Db, now = new Date()) {
  const s = await getSettings(db);
  const active = await db.subscription.findMany({ where: { status: "ACTIVE" }, select: { customerId: true, amount: true, nextBillingDate: true } });
  const mrr = round2(sum(active.map((a) => a.amount)));
  const clients = new Set(active.map((a) => a.customerId)).size;
  const day = planDay(now);
  const milestones = [
    { day: 60, count: s.agencyTargetDay60 },
    { day: 120, count: s.agencyTargetDay120 },
    { day: 229, count: s.agencyTargetDay229 },
  ];
  const next = milestones.find((m) => m.day >= day) ?? milestones[milestones.length - 1];
  const due = active.filter((a) => a.nextBillingDate <= riyadhEndOfDay(riyadhDateKey(now))).length;
  return { mrr, clients, next, due, daysToMilestone: Math.max(next.day - day, 0), milestones };
}

export async function dueSubscriptions(db: Db, now = new Date()) {
  return db.subscription.findMany({
    where: { status: "ACTIVE", nextBillingDate: { lte: riyadhEndOfDay(riyadhDateKey(now)) } },
    include: { customer: { select: { name: true } } },
    orderBy: { nextBillingDate: "asc" },
  });
}

export const monthKeyOf = (d: Date) => riyadhDateKey(d).slice(0, 7);
export const prevMonthKey = (d: Date) => riyadhDateKey(new Date(riyadhStartOfDay(`${monthKeyOf(d)}-01`).getTime() - 86400000)).slice(0, 7);
export { addDaysKey };
