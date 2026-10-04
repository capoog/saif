import type { CarDeal, CarDealCost, Prisma } from "@prisma/client";
import { ageInDays } from "@/domain/plan-calendar";
import { brokerageCommission, carHoldingSignal, checkCarPurchase, marketAverage, type CarChecklist } from "@/domain/rules";
import { D, Decimal, round2, sum, toDb2, type DecimalLike } from "@/domain/money";
import type { Settings } from "@/domain/settings";
import type { Db, Tx } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import { postEntry } from "../ledger";
import { enforceRules, type Override } from "../rules";
import { createQuote } from "./quotes";
import { getSettings } from "./settings";
import { assertSufficient } from "./transactions";

export interface CarInput {
  type: "BROKERAGE" | "PURCHASE";
  make: string;
  year: number;
  mileage?: number | null;
  color?: string | null;
  specs?: string | null;
  vin?: string | null;
  source?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  marketPrices?: string[];
  askingPrice?: string | null;
  commissionType?: "FIXED" | "PERCENT" | null;
  commissionValue?: string | null;
  notes?: string | null;
}

export function carTitle(c: Pick<CarDeal, "make" | "year">) {
  return `${c.make} ${c.year}`;
}

function clean(i: CarInput) {
  if (!i.make?.trim()) throw new UserError("اكتب الشركة والموديل");
  const thisYear = new Date().getUTCFullYear() + 1;
  if (!Number.isInteger(i.year) || i.year < 1980 || i.year > thisYear) throw new UserError("سنة الصنع غير صالحة");
  if (i.mileage != null && (!Number.isInteger(i.mileage) || i.mileage < 0)) throw new UserError("الممشى رقم صحيح");
  const prices = (i.marketPrices ?? []).map((p) => p.replace(/,/g, "").trim()).filter(Boolean).slice(0, 10);
  for (const p of prices) if (!/^\d+(\.\d{1,2})?$/.test(p)) throw new UserError(`سعر إعلان غير صالح: ${p}`);
  if (i.commissionType === "PERCENT" && i.commissionValue && D(i.commissionValue).gt(100)) throw new UserError("نسبة العمولة لازم تكون أقل من 100");
  const avg = marketAverage(prices);
  return {
    make: i.make.trim(),
    year: i.year,
    mileage: i.mileage ?? null,
    color: i.color?.trim() || null,
    specs: i.specs?.trim() || null,
    vin: i.vin?.trim() || null,
    source: i.source?.trim() || null,
    ownerName: i.ownerName?.trim() || null,
    ownerPhone: i.ownerPhone?.trim() || null,
    marketPrices: prices,
    marketAvg: avg ? toDb2(avg) : null,
    askingPrice: i.askingPrice ? toDb2(i.askingPrice) : null,
    commissionType: i.type === "BROKERAGE" ? (i.commissionType ?? "FIXED") : null,
    commissionValue: i.type === "BROKERAGE" && i.commissionValue ? toDb2(i.commissionValue) : null,
    notes: i.notes?.trim() || null,
  };
}

export async function createCar(db: Db, actor: Actor, input: CarInput) {
  return db.$transaction(async (tx) => {
    const c = await tx.carDeal.create({
      data: { type: input.type, status: input.type === "BROKERAGE" ? "LISTED" : "EVALUATING", ...clean(input), createdById: actor.userId },
    });
    await audit(tx, actor, "create", "CarDeal", c.id, { after: c });
    return c;
  });
}

export async function updateCar(db: Db, actor: Actor, id: string, input: Omit<CarInput, "type">) {
  return db.$transaction(async (tx) => {
    const before = await tx.carDeal.findUniqueOrThrow({ where: { id } });
    if (before.status === "SOLD" || before.status === "CANCELLED") throw new UserError("الصفقة مقفلة");
    const c = await tx.carDeal.update({ where: { id }, data: clean({ ...input, type: before.type }) });
    await audit(tx, actor, "update", "CarDeal", id, { before, after: c });
    return c;
  });
}

export async function setChecklist(db: Db, actor: Actor, id: string, checklist: CarChecklist) {
  return db.$transaction(async (tx) => {
    const before = await tx.carDeal.findUniqueOrThrow({ where: { id } });
    const c = await tx.carDeal.update({ where: { id }, data: { checklist: checklist as Prisma.InputJsonValue } });
    await audit(tx, actor, "checklist", "CarDeal", id, { before: before.checklist, after: checklist });
    return c;
  });
}

async function carsEngine(tx: Tx) {
  return (await tx.engine.findUniqueOrThrow({ where: { code: "CARS" } })).id;
}

async function moneyAccount(tx: Tx, id: string) {
  const a = await tx.ledgerAccount.findUnique({ where: { id } });
  if (!a?.isMoney) throw new UserError("اختر حساب نقدي صالح");
  return a;
}

/**
 * شراء سيارة: قواعد السيارات (رأس مال ≥ 50 ألف، ≤ 35% من رأس المال، السيولة، قائمة الفحص، ≤ 85% من السوق).
 * أي مخالفة توقف العملية إلا بسبب تجاوز مكتوب.
 */
export async function buyCar(db: Db, actor: Actor, id: string, input: { price: DecimalLike; accountId: string; date: Date; override?: Override }) {
  const price = round2(D(input.price));
  if (price.lte(0)) throw new UserError("سعر الشراء لازم يكون أكبر من صفر");
  const settings = await getSettings(db);
  return db.$transaction(async (tx) => {
    const c = await tx.carDeal.findUniqueOrThrow({ where: { id } });
    if (c.type !== "PURCHASE") throw new UserError("هذي سيارة وساطة — ما تنشرى");
    if (c.status !== "EVALUATING") throw new UserError("السيارة هذي انشرت أو انقفلت");
    const acct = await moneyAccount(tx, input.accountId);
    await assertSufficient(tx, acct.id, price, acct.name);
    await enforceRules(
      tx,
      actor,
      { kind: "CAR_PURCHASE", amount: price, cashOut: price, inventoryIn: price },
      input.override,
      { entity: "CarDeal", entityId: id },
      checkCarPurchase(c.checklist as CarChecklist, price, c.marketAvg, settings),
    );
    await postEntry(tx, {
      date: input.date,
      description: `شراء سيارة: ${carTitle(c)}`,
      sourceType: "CAR",
      sourceId: c.id,
      createdById: actor.userId,
      lines: [
        { accountCode: "CAR_STOCK", debit: price, engineId: await carsEngine(tx) },
        { accountCode: acct.code, credit: price },
      ],
    });
    const saved = await tx.carDeal.update({ where: { id }, data: { status: "OWNED", purchasePrice: toDb2(price), purchasedAt: input.date } });
    await audit(tx, actor, "buy", "CarDeal", id, { after: { price } });
    return saved;
  });
}

/** تكلفة تجهيز (فحص، تلميع، إصلاح): بتدخل في تكلفة السيارة مو مصروف */
export async function addCarCost(db: Db, actor: Actor, id: string, input: { description: string; amount: DecimalLike; accountId: string; date: Date; override?: Override }) {
  const amount = round2(D(input.amount));
  if (amount.lte(0)) throw new UserError("المبلغ لازم يكون أكبر من صفر");
  if (!input.description?.trim()) throw new UserError("اكتب وصف التكلفة");
  return db.$transaction(async (tx) => {
    const c = await tx.carDeal.findUniqueOrThrow({ where: { id } });
    if (c.status !== "OWNED") throw new UserError("تكاليف التجهيز بعد الشراء وقبل البيع بس");
    const acct = await moneyAccount(tx, input.accountId);
    await assertSufficient(tx, acct.id, amount, acct.name);
    await enforceRules(tx, actor, { kind: "CASH_OUT", amount, cashOut: amount, capitalChange: 0 }, input.override, { entity: "CarDeal", entityId: id });
    const cost = await tx.carDealCost.create({ data: { carDealId: id, date: input.date, description: input.description.trim(), amount: toDb2(amount), accountId: acct.id } });
    const entry = await postEntry(tx, {
      date: input.date,
      description: `تجهيز ${carTitle(c)}: ${input.description.trim()}`,
      sourceType: "CAR",
      sourceId: c.id,
      createdById: actor.userId,
      lines: [
        { accountCode: "CAR_STOCK", debit: amount, engineId: await carsEngine(tx) },
        { accountCode: acct.code, credit: amount },
      ],
    });
    await tx.carDealCost.update({ where: { id: cost.id }, data: { journalEntryId: entry.id } });
    await audit(tx, actor, "cost", "CarDeal", id, { after: { description: cost.description, amount } });
    return cost;
  });
}

export function carCost(c: Pick<CarDeal, "purchasePrice">, costs: Pick<CarDealCost, "amount">[]): Decimal {
  return round2(D(c.purchasePrice).plus(sum(costs.map((x) => x.amount))));
}

/**
 * البيع: شراء وبيع = إيراد بسعر البيع وتكلفة بإجمالي تكلفة السيارة.
 * وساطة = العمولة بس هي الإيراد (فلوس السيارة نفسها مو لي).
 */
export async function sellCar(db: Db, actor: Actor, id: string, input: { price: DecimalLike; accountId: string; date: Date; buyerId?: string | null }) {
  const price = round2(D(input.price));
  if (price.lte(0)) throw new UserError("سعر البيع لازم يكون أكبر من صفر");
  return db.$transaction(async (tx) => {
    const c = await tx.carDeal.findUniqueOrThrow({ where: { id }, include: { costs: true } });
    const acct = await moneyAccount(tx, input.accountId);
    const engineId = await carsEngine(tx);
    if (c.type === "PURCHASE") {
      if (c.status !== "OWNED") throw new UserError("السيارة لازم تكون مشتراة قبل البيع");
      const cost = carCost(c, c.costs);
      await postEntry(tx, {
        date: input.date,
        description: `بيع سيارة: ${carTitle(c)}`,
        sourceType: "CAR",
        sourceId: c.id,
        createdById: actor.userId,
        lines: [
          { accountCode: acct.code, debit: price },
          { accountCode: "REVENUE", credit: price, engineId },
          { accountCode: "COGS", debit: cost, engineId },
          { accountCode: "CAR_STOCK", credit: cost, engineId },
        ],
      });
      const saved = await tx.carDeal.update({ where: { id }, data: { status: "SOLD", salePrice: toDb2(price), soldAt: input.date, buyerId: input.buyerId || null } });
      await audit(tx, actor, "sell", "CarDeal", id, { after: { price, cost, profit: price.minus(cost) } });
      return saved;
    }
    if (c.status !== "LISTED") throw new UserError("الصفقة مقفلة");
    const commission = brokerageCommission(c.commissionType, c.commissionValue, price);
    if (commission.lte(0)) throw new UserError("حدد عمولتك قبل ما تقفل الصفقة");
    await postEntry(tx, {
      date: input.date,
      description: `عمولة وساطة: ${carTitle(c)}`,
      sourceType: "CAR",
      sourceId: c.id,
      createdById: actor.userId,
      lines: [
        { accountCode: acct.code, debit: commission },
        { accountCode: "REVENUE", credit: commission, engineId },
      ],
    });
    const saved = await tx.carDeal.update({ where: { id }, data: { status: "SOLD", salePrice: toDb2(price), soldAt: input.date, commission: toDb2(commission), buyerId: input.buyerId || null } });
    await audit(tx, actor, "sell", "CarDeal", id, { after: { price, commission } });
    return saved;
  });
}

export async function cancelCar(db: Db, actor: Actor, id: string, reason: string) {
  if (!reason?.trim()) throw new UserError("اكتب السبب");
  return db.$transaction(async (tx) => {
    const c = await tx.carDeal.findUniqueOrThrow({ where: { id } });
    if (c.status === "OWNED") throw new UserError("السيارة ملكك — لازم تنباع مو تنلغى");
    if (c.status === "SOLD" || c.status === "CANCELLED") throw new UserError("الصفقة مقفلة");
    const saved = await tx.carDeal.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(tx, actor, "cancel", "CarDeal", id, { reason });
    return saved;
  });
}

export interface CarView {
  cost: Decimal | null;
  profit: Decimal | null;
  roiPct: Decimal | null;
  holdingDays: number | null;
  signal: ReturnType<typeof carHoldingSignal> | null;
  pctOfMarket: Decimal | null;
  expectedCommission: Decimal | null;
}

/** أرقام الصفقة: التكلفة، الربح، العائد، أيام الاحتفاظ وتنبيهها */
export function carView(c: CarDeal & { costs: CarDealCost[] }, s: Settings, now = new Date()): CarView {
  const cost = c.type === "PURCHASE" && c.purchasePrice ? carCost(c, c.costs) : null;
  let profit: Decimal | null = null;
  if (c.status === "SOLD") profit = c.type === "PURCHASE" ? round2(D(c.salePrice).minus(cost ?? 0)) : D(c.commission);
  const holdingDays = c.status === "OWNED" && c.purchasedAt ? ageInDays(c.purchasedAt, now) : null;
  const ref = c.type === "PURCHASE" ? (c.purchasePrice ?? c.askingPrice) : c.askingPrice;
  return {
    cost,
    profit,
    roiPct: profit && cost && cost.gt(0) ? round2(profit.div(cost).times(100)) : null,
    holdingDays,
    signal: holdingDays !== null && cost ? carHoldingSignal(holdingDays, cost, s) : null,
    pctOfMarket: ref && c.marketAvg && D(c.marketAvg).gt(0) ? round2(D(ref).div(D(c.marketAvg)).times(100)) : null,
    expectedCommission: c.type === "BROKERAGE" && c.askingPrice ? brokerageCommission(c.commissionType, c.commissionValue, c.askingPrice) : null,
  };
}

/** عرض سعر للسيارة: بند واحد بمواصفاتها، والمواصفات بتطلع كجدول في الـ PDF */
export async function createCarQuote(db: Db, actor: Actor, id: string, input: { customerId: string; price: DecimalLike; validityDays?: number; terms?: string | null }) {
  const c = await db.carDeal.findUniqueOrThrow({ where: { id } });
  if (c.status === "SOLD" || c.status === "CANCELLED") throw new UserError("الصفقة مقفلة");
  if (D(input.price).lte(0)) throw new UserError("اكتب السعر");
  // المواصفات كاملة بتطلع في جدول السيارة بالـ PDF، فالبند يكفيه الاسم والممشى
  const details = c.mileage != null ? ` — ${c.mileage.toLocaleString("en-US")} كم` : "";
  return createQuote(db, actor, {
    customerId: input.customerId,
    date: new Date(),
    validityDays: input.validityDays ?? 3,
    depositPct: 0,
    carDealId: c.id,
    terms: input.terms,
    items: [{ description: `${carTitle(c)}${details}`, quantity: 1, unitPrice: input.price }],
  });
}
