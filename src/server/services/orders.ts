import type { OrderStatus, PaymentStatus } from "@prisma/client";
import { D, Decimal, round2, sum, toDb2, toDb4, ZERO, type DecimalLike } from "@/domain/money";
import { computeOrderTotals } from "@/domain/vat";
import type { Db, Tx } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import { postEntry, reverseEntry } from "../ledger";
import { consumeFifo } from "./inventory";
import { getSettings } from "./settings";
import { assertSufficient } from "./transactions";

export interface OrderItemInput {
  productId: string;
  quantity: number;
  unitPrice: string;
}

export interface PaymentInput {
  amount: string;
  method: string;
  accountId: string;
  date?: Date;
  note?: string | null;
}

export interface CreateOrderInput {
  date: Date;
  customerId?: string | null;
  customer?: { name: string; phone?: string | null } | null;
  channel: string;
  engineId?: string | null;
  items: OrderItemInput[];
  discount?: string;
  shippingFee?: string;
  status: Extract<OrderStatus, "NEW" | "CONFIRMED" | "SHIPPED" | "DELIVERED">;
  paymentMethod?: string | null;
  payment?: PaymentInput | null;
  officialInvoiceNo?: string | null;
  officialInvoiceUrl?: string | null;
  note?: string | null;
}

const OPEN: OrderStatus[] = ["NEW", "CONFIRMED", "SHIPPED"];
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  NEW: ["CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "DELIVERED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["RETURNED"],
  RETURNED: [],
  CANCELLED: [],
};

async function engineIdFor(tx: Tx, input: CreateOrderInput, firstProductEngine: string) {
  if (input.engineId) return input.engineId;
  if (input.channel === "B2B") {
    const b2b = await tx.engine.findUnique({ where: { code: "B2B" } });
    if (b2b) return b2b.id;
  }
  return firstProductEngine;
}

export async function createOrder(db: Db, actor: Actor, input: CreateOrderInput) {
  if (!input.items.length) throw new UserError("أضف بند واحد على الأقل");
  for (const it of input.items) {
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) throw new UserError("الكمية لازم تكون رقم صحيح موجب");
    if (D(it.unitPrice).lt(0)) throw new UserError("السعر لا يكون سالب");
  }
  const settings = await getSettings(db);
  const totals = computeOrderTotals({
    items: input.items,
    discount: input.discount,
    shippingFee: input.shippingFee,
    vatRegistered: settings.vatRegistered,
    vatRatePct: settings.vatRatePct,
    pricesIncludeVat: settings.pricesIncludeVat,
  });

  return db.$transaction(async (tx) => {
    const products = await tx.product.findMany({ where: { id: { in: input.items.map((i) => i.productId) }, deletedAt: null } });
    if (products.length !== new Set(input.items.map((i) => i.productId)).size) throw new UserError("منتج غير موجود");

    let customerId = input.customerId ?? null;
    if (!customerId && input.customer?.name?.trim()) {
      const phone = input.customer.phone?.trim() || null;
      const existing = phone ? await tx.customer.findFirst({ where: { phone, deletedAt: null } }) : null;
      customerId =
        existing?.id ??
        (await tx.customer.create({ data: { name: input.customer.name.trim(), phone, channel: input.channel } })).id;
    }

    const byId = new Map(products.map((p) => [p.id, p]));
    const order = await tx.order.create({
      data: {
        date: input.date,
        customerId,
        channel: input.channel,
        engineId: await engineIdFor(tx, input, byId.get(input.items[0].productId)!.engineId),
        status: "NEW",
        paymentMethod: input.paymentMethod ?? input.payment?.method ?? null,
        subtotal: toDb2(totals.subtotal),
        discount: toDb2(totals.discount),
        shippingFee: toDb2(totals.shippingFee),
        vatAmount: toDb2(totals.vatAmount),
        total: toDb2(totals.total),
        netRevenue: toDb2(totals.netRevenue),
        pricesIncludeVat: settings.pricesIncludeVat,
        vatRate: toDb4(totals.vatRate),
        officialInvoiceNo: input.officialInvoiceNo || null,
        officialInvoiceUrl: input.officialInvoiceUrl || null,
        note: input.note ?? null,
        createdById: actor.userId,
        items: {
          create: input.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: toDb2(i.unitPrice),
            lineTotal: toDb2(D(i.unitPrice).times(i.quantity)),
          })),
        },
      },
    });
    await audit(tx, actor, "create", "Order", order.id, { after: { ...order, items: input.items } });

    if (input.payment && D(input.payment.amount).gt(0)) {
      await addPaymentTx(tx, actor, order.id, { ...input.payment, date: input.payment.date ?? input.date });
    }
    if (input.status !== "NEW") await changeStatusTx(tx, actor, order.id, input.status, input.date);
    return tx.order.findUniqueOrThrow({ where: { id: order.id } });
  });
}

async function paidSoFar(tx: Tx, orderId: string): Promise<Decimal> {
  const s = await tx.payment.aggregate({ where: { orderId, deletedAt: null }, _sum: { amount: true } });
  return D(s._sum.amount);
}

async function refreshPaymentStatus(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const paid = await paidSoFar(tx, orderId);
  const hadPayments = (await tx.payment.count({ where: { orderId, deletedAt: null, amount: { gt: 0 } } })) > 0;
  const closed = order.status === "RETURNED" || order.status === "CANCELLED";
  let status: PaymentStatus;
  if (closed && hadPayments && paid.lte(0)) status = "REFUNDED";
  else if (paid.gte(D(order.total)) && paid.gt(0)) status = "PAID";
  else if (paid.gt(0)) status = "PARTIAL";
  else status = "UNPAID";
  await tx.order.update({ where: { id: orderId }, data: { paymentStatus: status } });
}

/**
 * دفعة من العميل (أو استرداد لو المبلغ سالب).
 * قبل التسليم = عربون (التزام)، بعد التسليم = تحصيل ذمة. الاتنين على حساب العملاء لنفس الطلب.
 */
async function addPaymentTx(tx: Tx, actor: Actor, orderId: string, input: PaymentInput) {
  const amount = round2(D(input.amount));
  if (amount.isZero()) throw new UserError("المبلغ لا يكون صفر");
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const acct = await tx.ledgerAccount.findUnique({ where: { id: input.accountId } });
  if (!acct?.isMoney) throw new UserError("حساب الاستلام غير صالح");
  const paid = await paidSoFar(tx, orderId);
  const date = input.date ?? new Date();

  if (amount.gt(0)) {
    if (order.status === "CANCELLED" || order.status === "RETURNED") throw new UserError("الطلب ملغي أو مرتجع");
    if (paid.plus(amount).gt(D(order.total))) {
      throw new UserError(`المبلغ أكبر من المتبقي (${D(order.total).minus(paid).toFixed(2)})`);
    }
  } else {
    if (amount.neg().gt(paid)) throw new UserError(`الاسترداد أكبر من المدفوع (${paid.toFixed(2)})`);
    await assertSufficient(tx, acct.id, amount.neg(), acct.name);
  }

  const payment = await tx.payment.create({
    data: { orderId, date, amount: toDb2(amount), method: input.method, accountId: acct.id, note: input.note ?? null },
  });
  const isRefund = amount.lt(0);
  const abs = amount.abs();
  const entry = await postEntry(tx, {
    date,
    description: isRefund ? `استرداد للعميل — طلب #${order.number}` : `دفعة عميل — طلب #${order.number}`,
    sourceType: "ORDER_PAYMENT",
    sourceId: payment.id,
    orderId,
    createdById: actor.userId,
    lines: isRefund
      ? [
          { accountCode: "CUSTOMERS", debit: abs },
          { accountCode: acct.code, credit: abs },
        ]
      : [
          { accountCode: acct.code, debit: abs },
          { accountCode: "CUSTOMERS", credit: abs },
        ],
  });
  await tx.payment.update({ where: { id: payment.id }, data: { journalEntryId: entry.id } });
  await refreshPaymentStatus(tx, orderId);
  await audit(tx, actor, "create", "Payment", payment.id, { after: payment });
  return payment;
}

export async function addPayment(db: Db, actor: Actor, orderId: string, input: PaymentInput) {
  return db.$transaction((tx) => addPaymentTx(tx, actor, orderId, input));
}

/**
 * التسليم = لحظة الاعتراف بالإيراد:
 * مدين العملاء (الإجمالي) / دائن المبيعات (بدون ضريبة) / دائن الضريبة المحصّلة
 * مدين تكلفة البضاعة / دائن المخزون (FIFO)
 * العربون المستلم قبل كده بيتقفل تلقائيًا لأنه على نفس حساب العملاء للطلب.
 */
async function deliverTx(tx: Tx, actor: Actor, orderId: string, date: Date) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { product: true } } } });
  let cogs = ZERO;
  for (const item of order.items) {
    const { totalCost } = await consumeFifo(tx, item.productId, item.quantity, date, "SALE", item.id);
    await tx.orderItem.update({ where: { id: item.id }, data: { cogs: toDb2(totalCost) } });
    cogs = cogs.plus(totalCost);
  }
  await postEntry(tx, {
    date,
    description: `تسليم طلب #${order.number}`,
    sourceType: "ORDER_DELIVERY",
    sourceId: order.id,
    orderId: order.id,
    createdById: actor.userId,
    lines: [
      { accountCode: "CUSTOMERS", debit: order.total },
      { accountCode: "REVENUE", credit: order.netRevenue, engineId: order.engineId },
      { accountCode: "VAT_PAYABLE", credit: order.vatAmount },
      { accountCode: "COGS", debit: cogs, engineId: order.engineId },
      { accountCode: "INVENTORY", credit: cogs, engineId: order.engineId },
    ],
  });
  await tx.order.update({ where: { id: orderId }, data: { status: "DELIVERED", deliveredAt: date } });
}

/** المرتجع: قيد عكسي للتسليم + رجوع الكميات لنفس الدفعات بنفس التكلفة */
async function returnTx(tx: Tx, actor: Actor, orderId: string, date: Date) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { consumptions: true } } } });
  const delivery = await tx.journalEntry.findFirst({
    where: { orderId, sourceType: "ORDER_DELIVERY", reversalOfId: null, reversedBy: { is: null } },
  });
  if (!delivery) throw new UserError("مفيش قيد تسليم للطلب ده");
  await reverseEntry(tx, delivery.id, date, `مرتجع طلب #${order.number}`, actor.userId);
  for (const item of order.items) {
    for (const c of item.consumptions.filter((c) => c.reason === "SALE")) {
      await tx.inventoryBatch.update({ where: { id: c.batchId }, data: { remaining: { increment: c.quantity } } });
      await tx.batchConsumption.create({
        data: {
          batchId: c.batchId,
          quantity: -c.quantity,
          unitCost: c.unitCost,
          cost: D(c.cost).neg().toFixed(2),
          date,
          orderItemId: item.id,
          reason: "RETURN",
        },
      });
    }
  }
  await tx.order.update({ where: { id: orderId }, data: { status: "RETURNED", returnedAt: date } });
}

async function changeStatusTx(tx: Tx, actor: Actor, orderId: string, to: OrderStatus, date: Date) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.deletedAt) throw new UserError("الطلب محذوف");
  if (!NEXT[order.status].includes(to)) throw new UserError(`لا يمكن التحويل من «${order.status}» إلى «${to}»`);
  if (to === "DELIVERED") await deliverTx(tx, actor, orderId, date);
  else if (to === "RETURNED") await returnTx(tx, actor, orderId, date);
  else if (to === "CANCELLED") await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: date } });
  else await tx.order.update({ where: { id: orderId }, data: { status: to } });
  await refreshPaymentStatus(tx, orderId);
  await audit(tx, actor, "status", "Order", orderId, { before: { status: order.status }, after: { status: to } });
}

export async function changeOrderStatus(
  db: Db,
  actor: Actor,
  orderId: string,
  to: OrderStatus,
  opts: { date?: Date; refund?: { accountId: string; method: string } | null } = {},
) {
  const date = opts.date ?? new Date();
  return db.$transaction(async (tx) => {
    await changeStatusTx(tx, actor, orderId, to, date);
    if ((to === "RETURNED" || to === "CANCELLED") && opts.refund) {
      const paid = await paidSoFar(tx, orderId);
      if (paid.gt(0)) {
        await addPaymentTx(tx, actor, orderId, { amount: paid.neg().toFixed(2), method: opts.refund.method, accountId: opts.refund.accountId, date });
      }
    }
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  });
}

export async function setOfficialInvoice(db: Db, actor: Actor, orderId: string, no: string | null, url: string | null) {
  return db.$transaction(async (tx) => {
    const before = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const saved = await tx.order.update({ where: { id: orderId }, data: { officialInvoiceNo: no || null, officialInvoiceUrl: url || null } });
    await audit(tx, actor, "update", "Order", orderId, {
      before: { officialInvoiceNo: before.officialInvoiceNo, officialInvoiceUrl: before.officialInvoiceUrl },
      after: { officialInvoiceNo: saved.officialInvoiceNo, officialInvoiceUrl: saved.officialInvoiceUrl },
    });
    return saved;
  });
}

export { OPEN as OPEN_ORDER_STATUSES, NEXT as ORDER_TRANSITIONS };
export function orderBalanceDue(total: DecimalLike, payments: { amount: DecimalLike }[]) {
  return round2(D(total).minus(sum(payments.map((p) => p.amount))));
}
