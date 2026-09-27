import type { QuoteStatus } from "@prisma/client";
import { D, Decimal, round2, sum, toDb2, ZERO, type DecimalLike } from "@/domain/money";
import { computeOrderTotals } from "@/domain/vat";
import type { Db, Tx } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import { enforceRules, type Override } from "../rules";
import { advanceDealTx } from "./crm";
import { addPaymentTx, createOrderTx } from "./orders";
import { getSettings } from "./settings";

export interface QuoteItemInput {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: DecimalLike;
}

export interface QuoteInput {
  customerId: string;
  dealId?: string | null;
  date: Date;
  validityDays?: number;
  items: QuoteItemInput[];
  discount?: DecimalLike;
  shippingFee?: DecimalLike;
  depositPct?: number;
  terms?: string | null;
  note?: string | null;
}

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "مسودة",
  SENT: "مرسل",
  ACCEPTED: "مقبول",
  REJECTED: "مرفوض",
  EXPIRED: "منتهي",
};

/** العرض بيتعامل "منتهي" لو عدّت صلاحيته وهو لسه مسودة أو مرسل */
export function effectiveQuoteStatus(q: { status: QuoteStatus; validUntil: Date }, now = new Date()): QuoteStatus {
  return (q.status === "DRAFT" || q.status === "SENT") && q.validUntil < now ? "EXPIRED" : q.status;
}

export function quoteNumberLabel(q: { number: number; date: Date }) {
  return `Q-${q.date.getUTCFullYear()}-${String(q.number).padStart(4, "0")}`;
}

export async function createQuote(db: Db, actor: Actor, input: QuoteInput) {
  if (!input.items.length) throw new UserError("أضف بند واحد على الأقل");
  for (const i of input.items) {
    if (!i.description?.trim() && !i.productId) throw new UserError("كل بند محتاج وصف أو منتج");
    if (!Number.isInteger(i.quantity) || i.quantity <= 0) throw new UserError("الكمية لازم تكون رقم صحيح موجب");
    if (D(i.unitPrice).lt(0)) throw new UserError("السعر لا يكون سالب");
  }
  const settings = await getSettings(db);
  const depositPct = input.depositPct ?? settings.b2bDepositPct;
  if (depositPct < 0 || depositPct > 100) throw new UserError("نسبة العربون من 0 لـ 100");
  const totals = computeOrderTotals({
    items: input.items,
    discount: input.discount,
    shippingFee: input.shippingFee,
    vatRegistered: settings.vatRegistered,
    vatRatePct: settings.vatRatePct,
    pricesIncludeVat: settings.pricesIncludeVat,
  });
  const validityDays = input.validityDays ?? settings.quoteValidityDays;
  return db.$transaction(async (tx) => {
    const products = await tx.product.findMany({ where: { id: { in: input.items.map((i) => i.productId).filter(Boolean) as string[] } } });
    const names = new Map(products.map((p) => [p.id, p.name]));
    const q = await tx.quote.create({
      data: {
        customerId: input.customerId,
        dealId: input.dealId ?? null,
        date: input.date,
        validUntil: new Date(input.date.getTime() + validityDays * 86400000),
        discount: toDb2(totals.discount),
        shippingFee: toDb2(totals.shippingFee),
        subtotal: toDb2(totals.subtotal),
        vatAmount: toDb2(totals.vatAmount),
        total: toDb2(totals.total),
        vatRatePct: settings.vatRegistered ? String(settings.vatRatePct) : "0",
        pricesIncludeVat: settings.pricesIncludeVat,
        depositPct: String(depositPct),
        terms: input.terms?.trim() || null,
        note: input.note?.trim() || null,
        createdById: actor.userId,
        items: {
          create: input.items.map((i, idx) => ({
            productId: i.productId || null,
            description: i.description?.trim() || names.get(i.productId!) || "",
            quantity: i.quantity,
            unitPrice: toDb2(i.unitPrice),
            lineTotal: toDb2(D(i.unitPrice).times(i.quantity)),
            sortOrder: idx,
          })),
        },
      },
    });
    await audit(tx, actor, "create", "Quote", q.id, { after: q });
    return q;
  });
}

export async function setQuoteStatus(db: Db, actor: Actor, id: string, status: Exclude<QuoteStatus, "ACCEPTED" | "EXPIRED">) {
  return db.$transaction(async (tx) => {
    const q = await tx.quote.findUniqueOrThrow({ where: { id } });
    if (q.status === "ACCEPTED") throw new UserError("العرض اتقبل واتحول لعقد");
    const saved = await tx.quote.update({ where: { id }, data: { status } });
    if (status === "SENT") await advanceDealTx(tx, actor, q.dealId, "QUOTE_SENT");
    await audit(tx, actor, "status", "Quote", id, { before: { status: q.status }, after: { status } });
    return saved;
  });
}

export interface DeliveryPlan {
  date: Date;
  /** كمية كل بند في الدفعة دي، بنفس ترتيب بنود العرض */
  quantities: number[];
}

/**
 * قبول العرض → عقد B2B. كل دفعة تسليم = طلب مؤكد مرتبط بالعقد (بنفس الأسعار).
 * الخصم بيتوزع على الدفعات بنسبة القيمة، والشحن على أول دفعة.
 */
export async function createContractFromQuote(
  db: Db,
  actor: Actor,
  quoteId: string,
  opts: { signedAt: Date; deliveries?: DeliveryPlan[]; note?: string | null; override?: Override },
) {
  const settings = await getSettings(db);
  return db.$transaction(async (tx) => {
    const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { items: { orderBy: { sortOrder: "asc" } }, contract: true } });
    if (q.contract) throw new UserError("العرض ده اتحول لعقد قبل كده");
    if (q.status === "REJECTED") throw new UserError("العرض مرفوض");
    if (q.items.some((i) => !i.productId)) throw new UserError("كل بنود العرض لازم تكون مربوطة بمنتج قبل ما تتحول لعقد");

    const deliveries = opts.deliveries?.length ? opts.deliveries : [{ date: opts.signedAt, quantities: q.items.map((i) => i.quantity) }];
    q.items.forEach((item, idx) => {
      const planned = deliveries.reduce((s, d) => s + (d.quantities[idx] ?? 0), 0);
      if (planned !== item.quantity) throw new UserError(`كمية «${item.description}» في الدفعات (${planned}) لازم تساوي كمية العرض (${item.quantity})`);
    });
    if (deliveries.some((d) => d.quantities.some((x) => !Number.isInteger(x) || x < 0))) throw new UserError("كميات الدفعات لازم تكون أرقام صحيحة");

    await enforceRules(tx, actor, { kind: "DEAL", amount: q.total, cashOut: 0 }, opts.override, { entity: "Quote", entityId: q.id });

    const contract = await tx.b2BContract.create({
      data: {
        customerId: q.customerId,
        quoteId: q.id,
        signedAt: opts.signedAt,
        depositPct: q.depositPct,
        total: q.total,
        note: opts.note ?? null,
        createdById: actor.userId,
      },
    });
    const b2b = await tx.engine.findUnique({ where: { code: "B2B" } });
    const subtotals = deliveries.map((d) => round2(sum(q.items.map((it, idx) => D(it.unitPrice).times(d.quantities[idx] ?? 0)))));
    const quoteSubtotal = D(q.subtotal);
    let discountLeft = D(q.discount);
    let total = ZERO;
    const live = deliveries.map((d, i) => ({ d, i })).filter(({ i }) => subtotals[i].gt(0));
    for (const [n, { d, i }] of live.entries()) {
      const discount = n === live.length - 1 ? discountLeft : quoteSubtotal.gt(0) ? round2(D(q.discount).times(subtotals[i]).div(quoteSubtotal)) : ZERO;
      discountLeft = discountLeft.minus(discount);
      const order = await createOrderTx(
        tx,
        actor,
        {
          date: opts.signedAt,
          customerId: q.customerId,
          channel: "B2B",
          engineId: b2b?.id ?? null,
          status: "CONFIRMED",
          items: q.items
            .map((it, idx) => ({ productId: it.productId!, quantity: d.quantities[idx] ?? 0, unitPrice: it.unitPrice.toString() }))
            .filter((x) => x.quantity > 0),
          discount: discount.toFixed(2),
          shippingFee: n === 0 ? q.shippingFee.toString() : "0",
          contractId: contract.id,
          scheduledFor: d.date,
          note: `عقد #${contract.number} — دفعة ${n + 1} من ${live.length}`,
        },
        settings,
      );
      total = total.plus(D(order.total));
    }
    // الإجمالي الفعلي بعد التقريب
    const saved = await tx.b2BContract.update({ where: { id: contract.id }, data: { total: toDb2(total) } });
    await tx.quote.update({ where: { id: q.id }, data: { status: "ACCEPTED" } });
    await advanceDealTx(tx, actor, q.dealId, "NEGOTIATION");
    await audit(tx, actor, "create", "B2BContract", contract.id, { after: saved });
    return saved;
  });
}

/** دفعات العقد بإجماليات كل طلب */
async function contractOrders(tx: Tx | Db, contractId: string) {
  const orders = await tx.order.findMany({
    where: { contractId, deletedAt: null },
    include: { payments: { where: { deletedAt: null }, select: { amount: true } }, items: { include: { product: { select: { name: true, kind: true } } } } },
    orderBy: [{ scheduledFor: "asc" }, { number: "asc" }],
  });
  return orders.map((o) => {
    const paid = round2(sum(o.payments.map((p) => p.amount)));
    return { ...o, paid, due: round2(D(o.total).minus(paid)) };
  });
}

/**
 * العربون: بيتوزع على دفعات العقد المفتوحة بنسبة المتبقي على كل دفعة (آخر دفعة تاخد الباقي).
 * قبل التسليم هو التزام (مش إيراد) — حساب العملاء لكل طلب.
 */
export async function recordContractPayment(
  db: Db,
  actor: Actor,
  contractId: string,
  input: { amount: DecimalLike; accountId: string; method: string; date: Date; note?: string | null },
) {
  const amount = round2(D(input.amount));
  if (amount.lte(0)) throw new UserError("المبلغ لازم يكون أكبر من صفر");
  return db.$transaction(async (tx) => {
    const c = await tx.b2BContract.findUniqueOrThrow({ where: { id: contractId }, include: { quote: true } });
    if (c.status === "CANCELLED") throw new UserError("العقد ملغي");
    const orders = (await contractOrders(tx, contractId)).filter((o) => o.status !== "CANCELLED" && o.status !== "RETURNED" && o.due.gt(0));
    const totalDue = sum(orders.map((o) => o.due));
    if (amount.gt(totalDue)) throw new UserError(`المبلغ أكبر من المتبقي على العقد (${totalDue.toFixed(2)})`);
    let left = amount;
    for (const [i, o] of orders.entries()) {
      const share = i === orders.length - 1 ? left : Decimal.min(o.due, round2(amount.times(o.due).div(totalDue)));
      left = left.minus(share);
      if (share.gt(0)) {
        await addPaymentTx(tx, actor, o.id, { amount: share.toFixed(2), method: input.method, accountId: input.accountId, date: input.date, note: input.note ?? `عقد #${c.number}` });
      }
    }
    await advanceDealTx(tx, actor, c.quote?.dealId, "DEPOSIT");
    return { amount };
  });
}

export async function cancelContract(db: Db, actor: Actor, contractId: string, reason: string) {
  if (!reason?.trim()) throw new UserError("اكتب سبب الإلغاء");
  return db.$transaction(async (tx) => {
    const c = await tx.b2BContract.findUniqueOrThrow({ where: { id: contractId }, include: { orders: true } });
    if (c.orders.some((o) => o.status === "DELIVERED")) throw new UserError("فيه دفعات اتسلمت — اعمل مرتجع أو إلغاء للدفعات المفتوحة من شاشة كل طلب");
    for (const o of c.orders.filter((o) => o.status !== "CANCELLED")) {
      await tx.order.update({ where: { id: o.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    }
    const saved = await tx.b2BContract.update({ where: { id: contractId }, data: { status: "CANCELLED" } });
    await audit(tx, actor, "cancel", "B2BContract", contractId, { reason });
    return saved;
  });
}

export async function contractDetail(db: Db, contractId: string) {
  const contract = await db.b2BContract.findUnique({ where: { id: contractId }, include: { customer: true, quote: true } });
  if (!contract) return null;
  const orders = await contractOrders(db, contractId);
  const live = orders.filter((o) => o.status !== "CANCELLED");
  const paid = sum(live.map((o) => o.paid));
  const depositTarget = round2(D(contract.total).times(D(contract.depositPct)).div(100));
  return {
    contract,
    orders,
    paid: round2(paid),
    due: round2(sum(live.map((o) => o.due))),
    depositTarget,
    depositReceived: paid.gte(depositTarget),
    delivered: live.filter((o) => o.status === "DELIVERED").length,
  };
}
