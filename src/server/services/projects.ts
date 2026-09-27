import type { InvoiceStatus, ProjectStatus, ProjectType } from "@prisma/client";
import { D, Decimal, round2, sum, toDb2, ZERO, type DecimalLike } from "@/domain/money";
import type { Settings } from "@/domain/settings";
import type { Db, Tx } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import { postEntry } from "../ledger";
import { enforceRules, type Override } from "../rules";
import { getSettings } from "./settings";
import { assertSufficient, createTransactionTx } from "./transactions";

export const PROJECT_TYPES: Record<ProjectType, string> = {
  QUALIFICATION: "تأهيل وتسجيل",
  PRIVATE_SUPPLY: "توريد خاص",
  GOV_TENDER: "مناقصة حكومية",
  SUBCONTRACT: "مقاولات باطن",
  DIRECT_CONTRACT: "مقاولات مباشرة",
};
export const PROJECT_STATUS: Record<ProjectStatus, string> = { BIDDING: "تقديم / تأهيل", ACTIVE: "قيد التنفيذ", COMPLETED: "مكتمل", LOST: "ما ترسى", CANCELLED: "ملغي" };
export const INVOICE_STATUS: Record<InvoiceStatus, string> = { DRAFT: "مسودة", SUBMITTED: "مقدّم", APPROVED: "معتمد", PAID: "محصّل" };

export interface ProjectInput {
  type: ProjectType;
  name: string;
  customerId: string;
  value: DecimalLike;
  advancePct?: DecimalLike;
  bankGuarantee?: DecimalLike;
  expectedCollectionDays?: number;
  startDate?: Date | null;
  notes?: string | null;
}

function clean(i: ProjectInput) {
  if (!i.name?.trim()) throw new UserError("اكتب اسم المشروع");
  if (D(i.value).lte(0)) throw new UserError("قيمة العقد لازم تكون أكبر من صفر");
  const adv = D(i.advancePct ?? 0);
  if (adv.lt(0) || adv.gt(100)) throw new UserError("نسبة الدفعة المقدمة من 0 لـ 100");
  return {
    type: i.type,
    name: i.name.trim(),
    customerId: i.customerId,
    value: toDb2(i.value),
    advancePct: adv.toFixed(2),
    bankGuarantee: toDb2(i.bankGuarantee ?? 0),
    expectedCollectionDays: i.expectedCollectionDays ?? 60,
    startDate: i.startDate ?? null,
    notes: i.notes?.trim() || null,
  };
}

export async function createProject(db: Db, actor: Actor, input: ProjectInput) {
  return db.$transaction(async (tx) => {
    const p = await tx.bigProject.create({ data: clean(input) });
    await audit(tx, actor, "create", "BigProject", p.id, { after: p });
    return p;
  });
}

export async function updateProject(db: Db, actor: Actor, id: string, input: ProjectInput & { status?: ProjectStatus }) {
  return db.$transaction(async (tx) => {
    const before = await tx.bigProject.findUniqueOrThrow({ where: { id } });
    const p = await tx.bigProject.update({ where: { id }, data: { ...clean(input), status: input.status ?? before.status } });
    await audit(tx, actor, "update", "BigProject", id, { before, after: p });
    return p;
  });
}

async function engineId(tx: Tx) {
  return (await tx.engine.findUniqueOrThrow({ where: { code: "SUPPLY" } })).id;
}
async function money(tx: Tx, id: string) {
  const a = await tx.ledgerAccount.findUnique({ where: { id } });
  if (!a?.isMoney) throw new UserError("اختر حساب نقدي صالح");
  return a;
}

/** الدفعة المقدمة: التزام للجهة (مو إيراد) لين تنخصم من المستخلصات */
export async function receiveAdvance(db: Db, actor: Actor, id: string, input: { amount: DecimalLike; accountId: string; date: Date }) {
  const amount = round2(D(input.amount));
  if (amount.lte(0)) throw new UserError("المبلغ لازم يكون أكبر من صفر");
  return db.$transaction(async (tx) => {
    const p = await tx.bigProject.findUniqueOrThrow({ where: { id } });
    const acct = await money(tx, input.accountId);
    await postEntry(tx, {
      date: input.date,
      description: `دفعة مقدمة — ${p.name}`,
      sourceType: "PROJECT",
      sourceId: p.id,
      projectId: p.id,
      createdById: actor.userId,
      lines: [
        { accountCode: acct.code, debit: amount },
        { accountCode: "CUSTOMERS", credit: amount },
      ],
    });
    if (p.status === "BIDDING") await tx.bigProject.update({ where: { id }, data: { status: "ACTIVE" } });
    await audit(tx, actor, "advance", "BigProject", id, { after: { amount } });
  });
}

/** مستخلص جديد (مسودة). الخصم من الدفعة المقدمة = قيمة الأعمال × نسبة المقدمة، بحد أقصى المتبقي منها */
export async function createInvoice(db: Db, actor: Actor, id: string, input: { amount: DecimalLike; date: Date; note?: string | null }) {
  const amount = round2(D(input.amount));
  if (amount.lte(0)) throw new UserError("قيمة المستخلص لازم تكون أكبر من صفر");
  const settings = await getSettings(db);
  return db.$transaction(async (tx) => {
    const p = await tx.bigProject.findUniqueOrThrow({ where: { id }, include: { invoices: true } });
    const invoiced = sum(p.invoices.map((i) => i.amount));
    if (invoiced.plus(amount).gt(D(p.value))) throw new UserError(`المستخلصات بتتعدى قيمة العقد (المتبقي ${D(p.value).minus(invoiced).toFixed(2)})`);
    const advanceTotal = round2(D(p.value).times(D(p.advancePct)).div(100));
    const deducted = sum(p.invoices.map((i) => i.advanceDeduction));
    const deduction = Decimal.min(round2(amount.times(D(p.advancePct)).div(100)), advanceTotal.minus(deducted));
    const vat = settings.vatRegistered ? round2(amount.times(settings.vatRatePct).div(100)) : ZERO;
    const inv = await tx.projectInvoice.create({
      data: {
        projectId: id,
        number: p.invoices.length + 1,
        date: input.date,
        amount: toDb2(amount),
        vatAmount: toDb2(vat),
        advanceDeduction: toDb2(Decimal.max(deduction, ZERO)),
        note: input.note ?? null,
      },
    });
    await audit(tx, actor, "create", "ProjectInvoice", inv.id, { after: inv });
    return inv;
  });
}

/** مقدّم ← معتمد: الاعتماد = إيراد لمحرك التوريد + ذمة على الجهة (الدفعة المقدمة بتنخصم تلقائيًا من رصيدها) */
export async function setInvoiceStatus(db: Db, actor: Actor, invoiceId: string, to: "SUBMITTED" | "APPROVED", date = new Date()) {
  return db.$transaction(async (tx) => {
    const inv = await tx.projectInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { project: true } });
    const order = ["DRAFT", "SUBMITTED", "APPROVED", "PAID"];
    if (order.indexOf(to) <= order.indexOf(inv.status)) throw new UserError("المستخلص في مرحلة أبعد");
    if (to === "APPROVED") {
      const gross = D(inv.amount).plus(D(inv.vatAmount));
      await postEntry(tx, {
        date,
        description: `مستخلص ${inv.number} — ${inv.project.name}`,
        sourceType: "PROJECT_INVOICE",
        sourceId: inv.id,
        projectId: inv.projectId,
        createdById: actor.userId,
        lines: [
          { accountCode: "CUSTOMERS", debit: gross },
          { accountCode: "REVENUE", credit: inv.amount, engineId: await engineId(tx) },
          { accountCode: "VAT_PAYABLE", credit: inv.vatAmount },
        ],
      });
    }
    const saved = await tx.projectInvoice.update({ where: { id: invoiceId }, data: { status: to, ...(to === "APPROVED" ? { approvedAt: date } : {}) } });
    await audit(tx, actor, "status", "ProjectInvoice", invoiceId, { before: { status: inv.status }, after: { status: to } });
    return saved;
  });
}

/** تحصيل مستخلص معتمد (صافي بعد خصم الدفعة المقدمة) */
export async function collectInvoice(db: Db, actor: Actor, invoiceId: string, input: { amount: DecimalLike; accountId: string; date: Date }) {
  const amount = round2(D(input.amount));
  if (amount.lte(0)) throw new UserError("المبلغ لازم يكون أكبر من صفر");
  return db.$transaction(async (tx) => {
    const inv = await tx.projectInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { project: true } });
    if (inv.status !== "APPROVED") throw new UserError("التحصيل بعد الاعتماد");
    const acct = await money(tx, input.accountId);
    await postEntry(tx, {
      date: input.date,
      description: `تحصيل مستخلص ${inv.number} — ${inv.project.name}`,
      sourceType: "PROJECT_PAYMENT",
      sourceId: inv.id,
      projectId: inv.projectId,
      createdById: actor.userId,
      lines: [
        { accountCode: acct.code, debit: amount },
        { accountCode: "CUSTOMERS", credit: amount },
      ],
    });
    const saved = await tx.projectInvoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: input.date } });
    await audit(tx, actor, "collect", "ProjectInvoice", invoiceId, { after: { amount } });
    return saved;
  });
}

/** هامش الضمان البنكي: فلوس محجوزة — من رأس المال لكن مو من السيولة */
export async function setGuaranteeMargin(db: Db, actor: Actor, id: string, input: { amount: DecimalLike; accountId: string; date: Date; override?: Override }) {
  const target = round2(D(input.amount));
  if (target.lt(0)) throw new UserError("المبلغ لا يكون سالب");
  return db.$transaction(async (tx) => {
    const p = await tx.bigProject.findUniqueOrThrow({ where: { id } });
    const diff = target.minus(D(p.guaranteeMargin));
    if (diff.isZero()) return p;
    const acct = await money(tx, input.accountId);
    if (diff.gt(0)) {
      await assertSufficient(tx, acct.id, diff, acct.name);
      await enforceRules(tx, actor, { kind: "CASH_OUT", amount: diff, cashOut: diff, capitalChange: 0 }, input.override, { entity: "BigProject", entityId: id });
    }
    await postEntry(tx, {
      date: input.date,
      description: `${diff.gt(0) ? "حجز" : "فك"} هامش ضمان — ${p.name}`,
      sourceType: "GUARANTEE",
      sourceId: p.id,
      createdById: actor.userId,
      lines: diff.gt(0)
        ? [
            { accountCode: "GUARANTEE_MARGIN", debit: diff, engineId: await engineId(tx) },
            { accountCode: acct.code, credit: diff },
          ]
        : [
            { accountCode: acct.code, debit: diff.neg() },
            { accountCode: "GUARANTEE_MARGIN", credit: diff.neg(), engineId: await engineId(tx) },
          ],
    });
    const saved = await tx.bigProject.update({ where: { id }, data: { guaranteeMargin: toDb2(target) } });
    await audit(tx, actor, "guarantee", "BigProject", id, { before: { margin: p.guaranteeMargin }, after: { margin: target } });
    return saved;
  });
}

/** مصروف على المشروع (مواد، عمالة، نقل…): مصروف على محرك التوريد مربوط بالمشروع */
export async function addProjectCost(db: Db, actor: Actor, id: string, input: { amount: DecimalLike; accountId: string; category: string; date: Date; note?: string | null; override?: Override }) {
  return db.$transaction(async (tx) => {
    const p = await tx.bigProject.findUniqueOrThrow({ where: { id } });
    return createTransactionTx(tx, actor, {
      type: "EXPENSE",
      date: input.date,
      amount: D(input.amount).toFixed(2),
      accountId: input.accountId,
      category: input.category,
      engineId: await engineId(tx),
      note: `${p.name}${input.note ? ` — ${input.note}` : ""}`,
      refType: "PROJECT",
      refId: p.id,
      override: input.override,
    });
  });
}

export interface ProjectSummary {
  advanceTarget: Decimal;
  advanceReceived: Decimal;
  invoiced: Decimal;
  approved: Decimal;
  collected: Decimal;
  balance: Decimal; // مدين = مستحق لنا، دائن = مقدمة ما انخصمت
  costs: Decimal;
  profit: Decimal;
  progressPct: Decimal;
  warnings: string[];
}

export async function projectSummary(db: Db | Tx, id: string, capital: DecimalLike, s: Pick<Settings, "projectMaxPct">): Promise<ProjectSummary> {
  const p = await db.bigProject.findUniqueOrThrow({ where: { id }, include: { invoices: true } });
  const [lines, costs] = await Promise.all([
    db.journalLine.findMany({ where: { entry: { projectId: id }, account: { kind: "CUSTOMER" } }, include: { entry: { select: { sourceType: true } } } }),
    db.transaction.aggregate({ where: { refType: "PROJECT", refId: id, deletedAt: null }, _sum: { amount: true } }),
  ]);
  const advanceReceived = sum(lines.filter((l) => l.entry.sourceType === "PROJECT").map((l) => l.credit));
  const collected = sum(lines.filter((l) => l.entry.sourceType === "PROJECT_PAYMENT").map((l) => l.credit));
  const balance = sum(lines.map((l) => D(l.debit).minus(D(l.credit))));
  const approved = sum(p.invoices.filter((i) => i.status === "APPROVED" || i.status === "PAID").map((i) => i.amount));
  const invoiced = sum(p.invoices.map((i) => i.amount));
  const cost = D(costs._sum.amount);
  const warnings: string[] = [];
  const limit = D(capital).times(s.projectMaxPct).div(100);
  if (p.status === "BIDDING" || p.status === "ACTIVE") {
    if (D(p.value).gt(limit)) warnings.push(`قيمة العقد ${D(p.value).toFixed(0)} أكبر من ${s.projectMaxPct}% من رأس المال (${limit.toFixed(0)})`);
    if (D(p.advancePct).isZero()) warnings.push("بدون دفعة مقدمة — التمويل كله عليك لين التحصيل");
  }
  return {
    advanceTarget: round2(D(p.value).times(D(p.advancePct)).div(100)),
    advanceReceived: round2(advanceReceived),
    invoiced: round2(invoiced),
    approved: round2(approved),
    collected: round2(collected),
    balance: round2(balance),
    costs: round2(cost),
    profit: round2(approved.minus(cost)),
    progressPct: D(p.value).gt(0) ? round2(invoiced.div(D(p.value)).times(100)) : ZERO,
    warnings,
  };
}
