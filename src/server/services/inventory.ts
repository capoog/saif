import { allocateFifo, InsufficientStockError, type FifoAllocation } from "@/domain/fifo";
import { D, Decimal, round2, sum, toDb2, toDb4, ZERO } from "@/domain/money";
import { ageInDays } from "@/domain/plan-calendar";
import type { Db, Tx } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import { postEntry } from "../ledger";
import { assertSufficient } from "./transactions";

export interface BatchInput {
  productId: string;
  receivedAt: Date;
  quantity: number;
  /** سعر شراء الوحدة (بدون الشحن) */
  unitPrice: string;
  /** شحن وجمارك وتكاليف إضافية على الدفعة كلها */
  extraCosts?: string;
  /** المدفوع الآن، والباقي يتسجل كمستحق للمورد */
  paidAmount: string;
  paidFromId?: string | null;
  supplierName?: string | null;
  note?: string | null;
  /** تحديث سعر البيع الافتراضي للمنتج */
  sellPrice?: string | null;
}

export async function createBatch(db: Db, actor: Actor, input: BatchInput) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new UserError("الكمية لازم تكون رقم صحيح موجب");
  const unitPrice = D(input.unitPrice);
  const extra = D(input.extraCosts ?? 0);
  if (unitPrice.lt(0) || extra.lt(0)) throw new UserError("التكلفة لا تكون سالبة");
  const totalCost = round2(unitPrice.times(input.quantity).plus(extra));
  if (totalCost.lte(0)) throw new UserError("تكلفة الدفعة لازم تكون أكبر من صفر");
  const unitCost = totalCost.div(input.quantity);
  const paid = round2(D(input.paidAmount));
  if (paid.lt(0) || paid.gt(totalCost)) throw new UserError("المدفوع لازم يكون بين صفر وإجمالي التكلفة");
  const payable = totalCost.minus(paid);
  if (payable.gt(0) && !input.supplierName?.trim()) throw new UserError("اكتب اسم المورد للمبلغ الآجل");

  return db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: input.productId } });
    if (!product || product.deletedAt) throw new UserError("المنتج غير موجود");

    let paidFromCode: string | null = null;
    if (paid.gt(0)) {
      if (!input.paidFromId) throw new UserError("اختار الحساب اللي هتدفع منه");
      const acct = await tx.ledgerAccount.findUnique({ where: { id: input.paidFromId } });
      if (!acct?.isMoney) throw new UserError("حساب الدفع غير صالح");
      await assertSufficient(tx, acct.id, paid, acct.name);
      paidFromCode = acct.code;
    }

    const batch = await tx.inventoryBatch.create({
      data: {
        productId: product.id,
        receivedAt: input.receivedAt,
        quantity: input.quantity,
        remaining: input.quantity,
        unitCost: toDb4(unitCost),
        totalCost: toDb2(totalCost),
        paidAmount: toDb2(paid),
        paidFromId: paid.gt(0) ? input.paidFromId : null,
        supplierName: input.supplierName?.trim() || null,
        note: input.note ?? null,
      },
    });
    const entry = await postEntry(tx, {
      date: input.receivedAt,
      description: `شراء دفعة: ${product.name} × ${input.quantity}`,
      sourceType: "BATCH",
      sourceId: batch.id,
      createdById: actor.userId,
      lines: [
        { accountCode: "INVENTORY", debit: totalCost, engineId: product.engineId },
        ...(paidFromCode ? [{ accountCode: paidFromCode, credit: paid }] : []),
        { accountCode: "SUPPLIERS", credit: payable, memo: input.supplierName ?? undefined },
      ],
    });
    const saved = await tx.inventoryBatch.update({ where: { id: batch.id }, data: { journalEntryId: entry.id } });

    const productPatch: Record<string, unknown> = {};
    if (product.status === "PRIORITY_TEST" || product.status === "LATER") productPatch.status = "TESTING";
    if (input.sellPrice) productPatch.defaultSellPrice = toDb2(input.sellPrice);
    if (Object.keys(productPatch).length) await tx.product.update({ where: { id: product.id }, data: productPatch });

    await audit(tx, actor, "create", "InventoryBatch", batch.id, { after: saved });
    return saved;
  });
}

/** القيمة المتبقية بالظبط لكل دفعة = التكلفة الإجمالية − صافي المخصوم */
async function batchesWithValue(tx: Tx, productId: string) {
  const batches = await tx.inventoryBatch.findMany({
    where: { productId, deletedAt: null, remaining: { gt: 0 } },
    include: { consumptions: { select: { cost: true } } },
  });
  return batches.map((b) => ({
    id: b.id,
    receivedAt: b.receivedAt,
    remaining: b.remaining,
    unitCost: D(b.unitCost),
    remainingValue: D(b.totalCost).minus(sum(b.consumptions.map((c) => c.cost))),
  }));
}

/** يخصم كمية من المخزون بـ FIFO ويسجّل الاستهلاك. بيرجّع التكلفة الإجمالية. */
export async function consumeFifo(
  tx: Tx,
  productId: string,
  quantity: number,
  date: Date,
  reason: "SALE" | "ADJUSTMENT",
  orderItemId?: string,
): Promise<{ allocations: FifoAllocation[]; totalCost: Decimal }> {
  const batches = await batchesWithValue(tx, productId);
  let result;
  try {
    result = allocateFifo(batches, quantity);
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      const p = await tx.product.findUnique({ where: { id: productId }, select: { name: true } });
      throw new UserError(`مخزون «${p?.name}» غير كافٍ: مطلوب ${e.requested}، متاح ${e.available}`);
    }
    throw e;
  }
  for (const a of result.allocations) {
    const updated = await tx.inventoryBatch.updateMany({
      where: { id: a.batchId, remaining: { gte: a.quantity } },
      data: { remaining: { decrement: a.quantity } },
    });
    if (updated.count !== 1) throw new UserError("المخزون اتغير أثناء العملية، حاول تاني");
    await tx.batchConsumption.create({
      data: {
        batchId: a.batchId,
        quantity: a.quantity,
        unitCost: toDb4(a.unitCost),
        cost: toDb2(a.cost),
        date,
        orderItemId: orderItemId ?? null,
        reason,
      },
    });
  }
  return result;
}

export interface StockLevel {
  productId: string;
  onHand: number;
  reserved: number;
  available: number;
  value: Decimal;
}

/** المخزون الفعلي، والمحجوز لطلبات لسه متسلمتش */
export async function stockLevels(db: Db | Tx, productIds?: string[]): Promise<Map<string, StockLevel>> {
  const where = productIds ? { productId: { in: productIds } } : {};
  const [batches, reservedRows] = await Promise.all([
    db.inventoryBatch.findMany({
      where: { ...where, deletedAt: null, remaining: { gt: 0 } },
      include: { consumptions: { select: { cost: true } } },
    }),
    db.orderItem.groupBy({
      by: ["productId"],
      where: { ...where, order: { status: { in: ["NEW", "CONFIRMED", "SHIPPED"] }, deletedAt: null } },
      _sum: { quantity: true },
    }),
  ]);
  const map = new Map<string, StockLevel>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) map.set(id, (s = { productId: id, onHand: 0, reserved: 0, available: 0, value: ZERO }));
    return s;
  };
  for (const b of batches) {
    const s = get(b.productId);
    s.onHand += b.remaining;
    s.value = s.value.plus(D(b.totalCost).minus(sum(b.consumptions.map((c) => c.cost))));
  }
  for (const r of reservedRows) get(r.productId).reserved = r._sum.quantity ?? 0;
  for (const s of map.values()) s.available = s.onHand - s.reserved;
  return map;
}

export interface BatchStats {
  id: string;
  ageDays: number;
  soldQty: number;
  sellThroughPct: number;
  /** نسبة البيع خلال أول 14 يوم (null لو الدفعة أحدث من 14 يوم) */
  sellThroughWindowPct: number | null;
}

export async function batchStats(db: Db | Tx, now: Date, windowDays: number) {
  const batches = await db.inventoryBatch.findMany({
    where: { deletedAt: null },
    include: { consumptions: true, product: { select: { name: true, id: true } } },
    orderBy: { receivedAt: "desc" },
  });
  return batches.map((b) => {
    const sales = b.consumptions.filter((c) => c.reason === "SALE" || c.reason === "RETURN");
    const soldQty = sales.reduce((s, c) => s + c.quantity, 0);
    const windowEnd = b.receivedAt.getTime() + windowDays * 86400000;
    const soldInWindow = sales.filter((c) => c.date.getTime() <= windowEnd).reduce((s, c) => s + c.quantity, 0);
    const age = ageInDays(b.receivedAt, now);
    return {
      id: b.id,
      productId: b.productId,
      productName: b.product.name,
      receivedAt: b.receivedAt,
      quantity: b.quantity,
      remaining: b.remaining,
      unitCost: D(b.unitCost),
      totalCost: D(b.totalCost),
      supplierName: b.supplierName,
      ageDays: age,
      soldQty,
      sellThroughPct: Math.round((soldQty / b.quantity) * 1000) / 10,
      sellThroughWindowPct: age >= windowDays ? Math.round((soldInWindow / b.quantity) * 1000) / 10 : null,
    };
  });
}

/** جرد: يضبط الكمية الفعلية للمنتج. النقص يتخصم FIFO، والزيادة تتسجل دفعة تسوية بآخر تكلفة. */
export async function adjustStock(db: Db, actor: Actor, productId: string, countedQty: number, date: Date, note?: string) {
  if (!Number.isInteger(countedQty) || countedQty < 0) throw new UserError("الكمية لازم تكون رقم صحيح ≥ 0");
  return db.$transaction(async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
    const level = (await stockLevels(tx, [productId])).get(productId);
    const onHand = level?.onHand ?? 0;
    const diff = countedQty - onHand;
    if (diff === 0) return { diff: 0, value: ZERO };

    let value: Decimal;
    if (diff < 0) {
      const { totalCost } = await consumeFifo(tx, productId, -diff, date, "ADJUSTMENT");
      value = totalCost;
      await postEntry(tx, {
        date,
        description: `جرد: نقص ${-diff} من ${product.name}`,
        sourceType: "ADJUSTMENT",
        sourceId: productId,
        createdById: actor.userId,
        lines: [
          { accountCode: "EXP_INV_ADJ", debit: value, engineId: product.engineId },
          { accountCode: "INVENTORY", credit: value, engineId: product.engineId },
        ],
      });
    } else {
      const last = await tx.inventoryBatch.findFirst({ where: { productId, deletedAt: null }, orderBy: { receivedAt: "desc" } });
      if (!last) throw new UserError("مفيش دفعة سابقة نعرف منها التكلفة — سجّل شراء دفعة بدل التسوية");
      value = round2(D(last.unitCost).times(diff));
      const batch = await tx.inventoryBatch.create({
        data: {
          productId,
          receivedAt: date,
          quantity: diff,
          remaining: diff,
          unitCost: last.unitCost,
          totalCost: toDb2(value),
          paidAmount: "0",
          note: "تسوية جرد (زيادة)",
        },
      });
      const entry = await postEntry(tx, {
        date,
        description: `جرد: زيادة ${diff} من ${product.name}`,
        sourceType: "ADJUSTMENT",
        sourceId: batch.id,
        createdById: actor.userId,
        lines: [
          { accountCode: "INVENTORY", debit: value, engineId: product.engineId },
          { accountCode: "EXP_INV_ADJ", credit: value, engineId: product.engineId },
        ],
      });
      await tx.inventoryBatch.update({ where: { id: batch.id }, data: { journalEntryId: entry.id } });
    }
    await audit(tx, actor, "adjust", "Product", productId, { before: { onHand }, after: { countedQty }, reason: note });
    return { diff, value };
  });
}
