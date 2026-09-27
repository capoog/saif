import type { DealStage, Prisma } from "@prisma/client";
import { csvToCustomers, normalizePhone } from "@/domain/csv";
import { toDb2, type DecimalLike } from "@/domain/money";
import { riyadhDateKey, riyadhEndOfDay, riyadhStartOfDay } from "@/domain/plan-calendar";
import type { Db, Tx } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";

export const DEAL_STAGES: { stage: DealStage; label: string }[] = [
  { stage: "LEAD", label: "عميل محتمل" },
  { stage: "CONTACTED", label: "تم التواصل" },
  { stage: "INTERESTED", label: "مهتم" },
  { stage: "QUOTE_SENT", label: "عرض سعر مرسل" },
  { stage: "NEGOTIATION", label: "تفاوض" },
  { stage: "DEPOSIT", label: "عربون مستلم" },
  { stage: "WON", label: "تم التسليم والتحصيل" },
  { stage: "LOST", label: "خسرناه" },
];
export const STAGE_ORDER: DealStage[] = DEAL_STAGES.map((s) => s.stage);
export const ACTIVITY_TYPES = [
  { code: "call", label: "مكالمة" },
  { code: "whatsapp", label: "واتساب" },
  { code: "dm", label: "رسالة سوشيال" },
  { code: "visit", label: "زيارة" },
  { code: "email", label: "إيميل" },
  { code: "other", label: "أخرى" },
];

export interface CustomerInput {
  name: string;
  type?: "individual" | "company";
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  sector?: string | null;
  contact?: string | null;
  channel?: string | null;
  notes?: string | null;
}

function cleanCustomer(i: CustomerInput) {
  if (!i.name?.trim()) throw new UserError("اكتب اسم العميل");
  return {
    name: i.name.trim(),
    type: i.type ?? "individual",
    phone: normalizePhone(i.phone) ?? null,
    email: i.email?.trim() || null,
    city: i.city?.trim() || null,
    sector: i.sector?.trim() || null,
    contact: i.contact?.trim() || null,
    channel: i.channel?.trim() || null,
    notes: i.notes?.trim() || null,
  };
}

export async function createCustomer(db: Db, actor: Actor, input: CustomerInput) {
  const data = cleanCustomer(input);
  return db.$transaction(async (tx) => {
    if (data.phone) {
      const dup = await tx.customer.findFirst({ where: { phone: data.phone, deletedAt: null } });
      if (dup) throw new UserError(`الجوال ده مسجل لعميل تاني: ${dup.name}`);
    }
    const c = await tx.customer.create({ data });
    await audit(tx, actor, "create", "Customer", c.id, { after: c });
    return c;
  });
}

export async function updateCustomer(db: Db, actor: Actor, id: string, input: CustomerInput) {
  const data = cleanCustomer(input);
  return db.$transaction(async (tx) => {
    const before = await tx.customer.findUniqueOrThrow({ where: { id } });
    if (data.phone) {
      const dup = await tx.customer.findFirst({ where: { phone: data.phone, deletedAt: null, id: { not: id } } });
      if (dup) throw new UserError(`الجوال ده مسجل لعميل تاني: ${dup.name}`);
    }
    const c = await tx.customer.update({ where: { id }, data });
    await audit(tx, actor, "update", "Customer", id, { before, after: c });
    return c;
  });
}

/** استيراد CSV: العملاء اللي جوالهم موجود بيتخطّوا */
export async function importCustomers(db: Db, actor: Actor, csv: string) {
  const { customers, skipped } = csvToCustomers(csv);
  if (customers.length === 0) throw new UserError("مفيش عملاء في الملف — أول عمود لازم يكون الاسم");
  if (customers.length > 2000) throw new UserError("الحد الأقصى 2000 عميل في المرة");
  return db.$transaction(
    async (tx) => {
      const phones = customers.map((c) => c.phone).filter(Boolean) as string[];
      const existing = new Set((await tx.customer.findMany({ where: { phone: { in: phones }, deletedAt: null }, select: { phone: true } })).map((c) => c.phone));
      let created = 0;
      let duplicates = 0;
      for (const c of customers) {
        if (c.phone && existing.has(c.phone)) {
          duplicates++;
          continue;
        }
        await tx.customer.create({ data: cleanCustomer(c) });
        if (c.phone) existing.add(c.phone);
        created++;
      }
      await audit(tx, actor, "import", "Customer", null, { after: { created, duplicates, skipped } });
      return { created, duplicates, skipped };
    },
    { timeout: 60000 },
  );
}

export interface DealInput {
  customerId: string;
  title: string;
  engineId?: string | null;
  stage?: DealStage;
  value?: DecimalLike | null;
  nextFollowUpAt?: Date | null;
  note?: string | null;
}

export async function createDeal(db: Db, actor: Actor, input: DealInput) {
  if (!input.title?.trim()) throw new UserError("اكتب عنوان الصفقة");
  return db.$transaction(async (tx) => {
    const d = await tx.deal.create({
      data: {
        customerId: input.customerId,
        title: input.title.trim(),
        engineId: input.engineId ?? null,
        stage: input.stage ?? "LEAD",
        value: input.value != null && input.value !== "" ? toDb2(input.value) : null,
        nextFollowUpAt: input.nextFollowUpAt ?? null,
        note: input.note ?? null,
        ownerId: actor.userId,
      },
    });
    await audit(tx, actor, "create", "Deal", d.id, { after: d });
    return d;
  });
}

export async function moveDealTx(tx: Tx, actor: Actor, id: string, stage: DealStage, lostReason?: string | null) {
  const before = await tx.deal.findUniqueOrThrow({ where: { id } });
  if (before.stage === stage) return before;
  if (stage === "LOST" && !lostReason?.trim()) throw new UserError("اكتب سبب الخسارة");
  const closed = stage === "WON" || stage === "LOST";
  const d = await tx.deal.update({
    where: { id },
    data: { stage, lostReason: stage === "LOST" ? lostReason!.trim() : null, closedAt: closed ? new Date() : null, nextFollowUpAt: closed ? null : before.nextFollowUpAt },
  });
  await audit(tx, actor, "stage", "Deal", id, { before: { stage: before.stage }, after: { stage } });
  return d;
}

export async function moveDeal(db: Db, actor: Actor, id: string, stage: DealStage, lostReason?: string | null) {
  return db.$transaction((tx) => moveDealTx(tx, actor, id, stage, lostReason));
}

/** يقدّم الصفقة لمرحلة معينة لو هي لسه قبلها (مايرجعهاش لورا) */
export async function advanceDealTx(tx: Tx, actor: Actor, id: string | null | undefined, stage: DealStage) {
  if (!id) return;
  const d = await tx.deal.findUnique({ where: { id } });
  if (!d || d.stage === "LOST" || d.stage === "WON") return;
  if (STAGE_ORDER.indexOf(d.stage) < STAGE_ORDER.indexOf(stage)) await moveDealTx(tx, actor, id, stage);
}

export async function setFollowUp(db: Db, actor: Actor, id: string, at: Date | null, note?: string | null) {
  return db.$transaction(async (tx) => {
    const d = await tx.deal.update({ where: { id }, data: { nextFollowUpAt: at, ...(note !== undefined ? { note } : {}) } });
    await audit(tx, actor, "followup", "Deal", id, { after: { nextFollowUpAt: at } });
    return d;
  });
}

export async function logActivity(
  db: Db,
  actor: Actor,
  input: { type: string; customerId?: string | null; dealId?: string | null; note?: string | null; date?: Date; nextFollowUpAt?: Date | null; count?: number },
) {
  const count = Math.min(Math.max(input.count ?? 1, 1), 100);
  return db.$transaction(async (tx) => {
    let customerId = input.customerId ?? null;
    if (input.dealId) {
      const deal = await tx.deal.findUniqueOrThrow({ where: { id: input.dealId } });
      customerId = customerId ?? deal.customerId;
      const patch: Prisma.DealUpdateInput = {};
      if (input.nextFollowUpAt !== undefined) patch.nextFollowUpAt = input.nextFollowUpAt;
      if (Object.keys(patch).length) await tx.deal.update({ where: { id: deal.id }, data: patch });
      if (deal.stage === "LEAD") await moveDealTx(tx, actor, deal.id, "CONTACTED");
    }
    const date = input.date ?? new Date();
    await tx.activity.createMany({
      data: Array.from({ length: count }, () => ({ date, type: input.type, customerId, dealId: input.dealId ?? null, note: input.note ?? null, userId: actor.userId })),
    });
    return { count };
  });
}

/** شاشة اليوم: المتابعات، العدّادات، ولوحة الصفقات */
export async function crmToday(db: Db | Tx, now = new Date()) {
  const key = riyadhDateKey(now);
  const start = riyadhStartOfDay(key);
  const end = riyadhEndOfDay(key);
  const open: DealStage[] = ["LEAD", "CONTACTED", "INTERESTED", "QUOTE_SENT", "NEGOTIATION", "DEPOSIT"];
  const [followUps, activitiesToday, quotesToday, deals] = await Promise.all([
    db.deal.findMany({
      where: { deletedAt: null, stage: { in: open }, nextFollowUpAt: { lte: end } },
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: { nextFollowUpAt: "asc" },
    }),
    db.activity.count({ where: { date: { gte: start, lte: end } } }),
    db.quote.count({ where: { date: { gte: start, lte: end } } }),
    db.deal.findMany({
      where: { deletedAt: null, OR: [{ stage: { in: open } }, { closedAt: { gte: new Date(now.getTime() - 30 * 86400000) } }] },
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    }),
  ]);
  return {
    followUps: followUps.map((d) => ({ ...d, overdue: d.nextFollowUpAt! < start })),
    activitiesToday,
    quotesToday,
    deals,
  };
}

export async function overdueFollowUpsCount(db: Db | Tx, now = new Date()) {
  return db.deal.count({
    where: { deletedAt: null, stage: { notIn: ["WON", "LOST"] }, nextFollowUpAt: { lt: riyadhStartOfDay(riyadhDateKey(now)) } },
  });
}
