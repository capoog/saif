import { Prisma } from "@prisma/client";
import { qty } from "@/domain/fifo";
import { D, Decimal, round2, sum, toDb2, toDb4, ZERO, type DecimalLike } from "@/domain/money";
import type { Db, Tx } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import { enforceRules, type Override } from "../rules";
import { createBatchTx } from "./inventory";
import { createTransactionTx } from "./transactions";

export const SUPPLIER_TYPES = ["مصنع", "موزع", "سوق جملة", "منشأة تعبئة", "محمصة", "مطبعة", "أخرى"] as const;

export interface SupplierInput {
  name: string;
  type: string;
  phone?: string | null;
  contact?: string | null;
  city?: string | null;
  rating?: number | null;
  notes?: string | null;
}

function cleanSupplier(input: SupplierInput) {
  if (!input.name?.trim()) throw new UserError("اكتب اسم المورد");
  if (input.rating != null && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) throw new UserError("التقييم من 1 لـ 5");
  return {
    name: input.name.trim(),
    type: input.type || "أخرى",
    phone: input.phone?.trim() || null,
    contact: input.contact?.trim() || null,
    city: input.city?.trim() || null,
    rating: input.rating ?? null,
    notes: input.notes?.trim() || null,
  };
}

export async function createSupplier(db: Db, actor: Actor, input: SupplierInput) {
  return db.$transaction(async (tx) => {
    const s = await tx.supplier.create({ data: cleanSupplier(input) });
    await audit(tx, actor, "create", "Supplier", s.id, { after: s });
    return s;
  });
}

export async function updateSupplier(db: Db, actor: Actor, id: string, input: SupplierInput) {
  return db.$transaction(async (tx) => {
    const before = await tx.supplier.findUniqueOrThrow({ where: { id } });
    const s = await tx.supplier.update({ where: { id }, data: cleanSupplier(input) });
    await audit(tx, actor, "update", "Supplier", id, { before, after: s });
    return s;
  });
}

/** المستحق لكل مورد (دائن − مدين على حساب الموردين بالـ supplierId) */
export async function supplierBalances(db: Db | Tx): Promise<Map<string, Decimal>> {
  const rows = await db.$queryRaw<{ supplierId: string; balance: Prisma.Decimal }[]>`
    SELECT l."supplierId" AS "supplierId", SUM(l."credit" - l."debit") AS "balance"
    FROM "JournalLine" l JOIN "LedgerAccount" a ON a."id" = l."accountId"
    WHERE a."kind" = 'SUPPLIER_PAYABLE' AND l."supplierId" IS NOT NULL
    GROUP BY l."supplierId"`;
  return new Map(rows.map((r) => [r.supplierId, D(r.balance)]));
}

export interface PurchaseOrderInput {
  supplierId: string;
  date: Date;
  expectedAt?: Date | null;
  extraCosts?: DecimalLike;
  note?: string | null;
  items: { productId: string; quantity: DecimalLike; unitPrice: DecimalLike }[];
}

export function poTotals(items: { quantity: DecimalLike; unitPrice: DecimalLike }[], extraCosts: DecimalLike) {
  const goods = round2(sum(items.map((i) => D(i.quantity).times(D(i.unitPrice)))));
  return { goods, extra: round2(D(extraCosts)), total: round2(goods.plus(D(extraCosts))) };
}

export async function createPurchaseOrder(db: Db, actor: Actor, input: PurchaseOrderInput) {
  if (!input.items.length) throw new UserError("أضف بند واحد على الأقل");
  for (const i of input.items) {
    if (qty(i.quantity).lte(0)) throw new UserError("الكمية لازم تكون أكبر من صفر");
    if (D(i.unitPrice).lt(0)) throw new UserError("السعر لا يكون سالب");
  }
  if (D(input.extraCosts ?? 0).lt(0)) throw new UserError("التكاليف الإضافية لا تكون سالبة");
  return db.$transaction(async (tx) => {
    const products = await tx.product.findMany({ where: { id: { in: input.items.map((i) => i.productId) } } });
    if (products.some((p) => p.kind === "BOX")) throw new UserError("البوكس ما ينشرى — اشتري مكوناته");
    const po = await tx.purchaseOrder.create({
      data: {
        supplierId: input.supplierId,
        date: input.date,
        expectedAt: input.expectedAt ?? null,
        extraCosts: toDb2(input.extraCosts ?? 0),
        note: input.note ?? null,
        createdById: actor.userId,
        items: { create: input.items.map((i) => ({ productId: i.productId, quantity: qty(i.quantity).toFixed(3), unitPrice: toDb4(i.unitPrice) })) },
      },
    });
    await audit(tx, actor, "create", "PurchaseOrder", po.id, { after: { ...po, items: input.items } });
    return po;
  });
}

/**
 * استلام أمر الشراء: كل بند يتحول دفعة مخزون (الشحن والتكاليف الإضافية تتوزع بنسبة قيمة البنود)،
 * القيمة كلها تتسجل مستحقة للمورد، والمدفوع الآن يتسجل سداد للمورد.
 */
export async function receivePurchaseOrder(
  db: Db,
  actor: Actor,
  id: string,
  opts: { date: Date; paidNow?: DecimalLike; paidFromId?: string | null; override?: Override },
) {
  return db.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { items: true, supplier: true } });
    if (po.status === "RECEIVED") throw new UserError("الأمر هذا تسلّم قبل كذا");
    if (po.status === "CANCELLED") throw new UserError("الأمر ملغي");
    const t = poTotals(po.items, po.extraCosts);
    const paidNow = round2(D(opts.paidNow ?? 0));
    if (paidNow.lt(0) || paidNow.gt(t.total)) throw new UserError("المدفوع لازم يكون بين صفر وإجمالي الأمر");

    await enforceRules(
      tx,
      actor,
      { kind: "INVENTORY_PURCHASE", amount: t.total, cashOut: paidNow, inventoryIn: t.total },
      opts.override,
      { entity: "PurchaseOrder", entityId: po.id },
    );

    // توزيع التكاليف الإضافية بنسبة القيمة، وآخر بند ياخذ الباقي
    let extraLeft = t.extra;
    for (const [idx, item] of po.items.entries()) {
      const value = D(item.quantity).times(D(item.unitPrice));
      const share = idx === po.items.length - 1 ? extraLeft : t.goods.gt(0) ? round2(t.extra.times(value).div(t.goods)) : ZERO;
      extraLeft = extraLeft.minus(share);
      await createBatchTx(tx, actor, {
        productId: item.productId,
        receivedAt: opts.date,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        extraCosts: share,
        paidAmount: 0,
        supplierId: po.supplierId,
        purchaseOrderId: po.id,
        note: `أمر شراء #${po.number}`,
      });
    }
    if (paidNow.gt(0)) {
      if (!opts.paidFromId) throw new UserError("اختار الحساب اللي بتدفع منه");
      await createTransactionTx(tx, actor, {
        type: "WITHDRAWAL",
        date: opts.date,
        amount: paidNow.toFixed(2),
        accountId: opts.paidFromId,
        category: "SUPPLIER_PAYMENT",
        supplierId: po.supplierId,
        note: `أمر شراء #${po.number}`,
        skipRules: true,
      });
    }
    const saved = await tx.purchaseOrder.update({ where: { id }, data: { status: "RECEIVED", receivedAt: opts.date } });
    await audit(tx, actor, "receive", "PurchaseOrder", id, { after: { total: t.total, paidNow } });
    return saved;
  });
}

export async function cancelPurchaseOrder(db: Db, actor: Actor, id: string) {
  return db.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
    if (po.status === "RECEIVED") throw new UserError("الأمر تسلّم — ما يصير يتلغي");
    const saved = await tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(tx, actor, "cancel", "PurchaseOrder", id, { before: { status: po.status } });
    return saved;
  });
}
