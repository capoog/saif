import type { Product } from "@prisma/client";
import { allocateFifo, InsufficientStockError, qty, type FifoAllocation } from "@/domain/fifo";
import { D, Decimal, round2, sum, toDb2, toDb4, ZERO, type DecimalLike } from "@/domain/money";
import { ageInDays } from "@/domain/plan-calendar";
import type { Db, Tx } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import { postEntry } from "../ledger";
import { enforceRules, type Override } from "../rules";
import { assertSufficient } from "./transactions";

const toDb3 = (v: DecimalLike) => qty(v).toFixed(3);

export interface BatchInput {
  productId: string;
  receivedAt: Date;
  quantity: DecimalLike;
  /** سعر شراء الوحدة (بدون الشحن) */
  unitPrice: DecimalLike;
  /** شحن وجمارك وتكاليف إضافية على الدفعة كلها */
  extraCosts?: DecimalLike;
  /** المدفوع الآن، والباقي يتسجل كمستحق للمورد */
  paidAmount: DecimalLike;
  paidFromId?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  purchaseOrderId?: string | null;
  note?: string | null;
  /** تحديث سعر البيع الافتراضي للمنتج */
  sellPrice?: string | null;
  /** سبب تجاوز قواعد المخاطر (لو العملية انوقفت) */
  override?: Override;
}

function batchTotals(input: BatchInput) {
  const quantity = qty(input.quantity);
  if (!quantity.isFinite() || quantity.lte(0)) throw new UserError("الكمية لازم تكون أكبر من صفر");
  const unitPrice = D(input.unitPrice);
  const extra = D(input.extraCosts ?? 0);
  if (unitPrice.lt(0) || extra.lt(0)) throw new UserError("التكلفة لا تكون سالبة");
  const totalCost = round2(unitPrice.times(quantity).plus(extra));
  if (totalCost.lte(0)) throw new UserError("تكلفة الدفعة لازم تكون أكبر من صفر");
  const paid = round2(D(input.paidAmount));
  if (paid.lt(0) || paid.gt(totalCost)) throw new UserError("المدفوع لازم يكون بين صفر وإجمالي التكلفة");
  return { quantity, totalCost, unitCost: totalCost.div(quantity), paid, payable: totalCost.minus(paid) };
}

/** تسجيل دفعة داخل transaction قائمة (بدون فحص القواعد — المستدعي مسؤول عنه) */
export async function createBatchTx(tx: Tx, actor: Actor, input: BatchInput) {
  const { quantity, totalCost, unitCost, paid, payable } = batchTotals(input);
  const product = await tx.product.findUnique({ where: { id: input.productId } });
  if (!product || product.deletedAt) throw new UserError("المنتج غير موجود");
  if (product.kind === "BOX") throw new UserError(`«${product.name}» بوكس — اشتري مكوناته مو البوكس نفسه`);
  if (product.kind === "SERVICE") throw new UserError(`«${product.name}» خدمة — ما لها مخزون`);

  let supplierName = input.supplierName?.trim() || null;
  if (input.supplierId) {
    const sup = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!sup) throw new UserError("المورد غير موجود");
    supplierName = sup.name;
  }
  if (payable.gt(0) && !input.supplierId && !supplierName) throw new UserError("اختار المورد للمبلغ الآجل");

  let paidFromCode: string | null = null;
  if (paid.gt(0)) {
    if (!input.paidFromId) throw new UserError("اختار الحساب اللي بتدفع منه");
    const acct = await tx.ledgerAccount.findUnique({ where: { id: input.paidFromId } });
    if (!acct?.isMoney) throw new UserError("حساب الدفع غير صالح");
    await assertSufficient(tx, acct.id, paid, acct.name);
    paidFromCode = acct.code;
  }

  const batch = await tx.inventoryBatch.create({
    data: {
      productId: product.id,
      receivedAt: input.receivedAt,
      quantity: toDb3(quantity),
      remaining: toDb3(quantity),
      unitCost: toDb4(unitCost),
      totalCost: toDb2(totalCost),
      paidAmount: toDb2(paid),
      paidFromId: paid.gt(0) ? input.paidFromId : null,
      supplierId: input.supplierId ?? null,
      supplierName,
      purchaseOrderId: input.purchaseOrderId ?? null,
      note: input.note ?? null,
    },
  });
  const entry = await postEntry(tx, {
    date: input.receivedAt,
    description: `شراء دفعة: ${product.name} × ${quantity.toString()}`,
    sourceType: "BATCH",
    sourceId: batch.id,
    createdById: actor.userId,
    lines: [
      { accountCode: "INVENTORY", debit: totalCost, engineId: product.engineId },
      ...(paidFromCode ? [{ accountCode: paidFromCode, credit: paid }] : []),
      { accountCode: "SUPPLIERS", credit: payable, supplierId: input.supplierId ?? null, memo: supplierName ?? undefined },
    ],
  });
  const saved = await tx.inventoryBatch.update({ where: { id: batch.id }, data: { journalEntryId: entry.id } });

  const productPatch: Record<string, unknown> = {};
  if (product.status === "PRIORITY_TEST" || product.status === "LATER") productPatch.status = "TESTING";
  if (input.sellPrice) productPatch.defaultSellPrice = toDb2(input.sellPrice);
  if (Object.keys(productPatch).length) await tx.product.update({ where: { id: product.id }, data: productPatch });

  await audit(tx, actor, "create", "InventoryBatch", batch.id, { after: saved });
  return saved;
}

/** شراء دفعة: قواعد المخاطر (حجم الصفقة، السيولة، سقف المخزون، الطوارئ) + التسجيل */
export async function createBatch(db: Db, actor: Actor, input: BatchInput) {
  const { totalCost, paid } = batchTotals(input);
  return db.$transaction(async (tx) => {
    await enforceRules(
      tx,
      actor,
      { kind: "INVENTORY_PURCHASE", amount: totalCost, cashOut: paid, inventoryIn: totalCost },
      input.override,
      { entity: "InventoryBatch" },
    );
    return createBatchTx(tx, actor, input);
  });
}

/** القيمة المتبقية بالضبط لكل دفعة = التكلفة الإجمالية − صافي المخصوم */
async function batchesWithValue(tx: Tx, productId: string) {
  const batches = await tx.inventoryBatch.findMany({
    where: { productId, deletedAt: null, remaining: { gt: 0 } },
    include: { consumptions: { select: { cost: true } } },
  });
  return batches.map((b) => ({
    id: b.id,
    receivedAt: b.receivedAt,
    remaining: D(b.remaining),
    unitCost: D(b.unitCost),
    remainingValue: D(b.totalCost).minus(sum(b.consumptions.map((c) => c.cost))),
  }));
}

/** يخصم كمية من المخزون بـ FIFO ويسجّل الاستهلاك. بيرجّع التكلفة الإجمالية. */
export async function consumeFifo(
  tx: Tx,
  productId: string,
  quantity: DecimalLike,
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
      where: { id: a.batchId, remaining: { gte: toDb3(a.quantity) } },
      data: { remaining: { decrement: toDb3(a.quantity) } },
    });
    if (updated.count !== 1) throw new UserError("المخزون تغيّر أثناء العملية، حاول مرة ثانية");
    await tx.batchConsumption.create({
      data: {
        batchId: a.batchId,
        quantity: toDb3(a.quantity),
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

/**
 * خصم بند طلب من المخزون: منتج عادي = FIFO منه. بوكس = FIFO من كل مكوّن × الكمية.
 */
export async function consumeForSale(tx: Tx, product: Pick<Product, "id" | "kind" | "name">, quantity: number, date: Date, orderItemId: string) {
  if (product.kind === "SERVICE") return ZERO;
  if (product.kind !== "BOX") return (await consumeFifo(tx, product.id, quantity, date, "SALE", orderItemId)).totalCost;
  const recipe = await tx.recipeLine.findMany({ where: { boxId: product.id } });
  if (recipe.length === 0) throw new UserError(`البوكس «${product.name}» ما له مكونات — أضف الوصفة الأول`);
  let total = ZERO;
  for (const line of recipe) {
    const { totalCost } = await consumeFifo(tx, line.componentId, D(line.quantity).times(quantity), date, "SALE", orderItemId);
    total = total.plus(totalCost);
  }
  return total;
}

export interface StockLevel {
  productId: string;
  onHand: Decimal;
  reserved: Decimal;
  available: Decimal;
  value: Decimal;
}

/** المخزون الفعلي، والمحجوز لطلبات للحين ما تسلّمت (البوكسات بتحجز من مكوناتها) */
export async function stockLevels(db: Db | Tx, productIds?: string[]): Promise<Map<string, StockLevel>> {
  const where = productIds ? { productId: { in: productIds } } : {};
  const [batches, openItems] = await Promise.all([
    db.inventoryBatch.findMany({
      where: { ...where, deletedAt: null, remaining: { gt: 0 } },
      include: { consumptions: { select: { cost: true } } },
    }),
    db.orderItem.findMany({
      where: { order: { status: { in: ["NEW", "CONFIRMED", "SHIPPED"] }, deletedAt: null } },
      select: { productId: true, quantity: true, product: { select: { kind: true, recipe: { select: { componentId: true, quantity: true } } } } },
    }),
  ]);
  const map = new Map<string, StockLevel>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) map.set(id, (s = { productId: id, onHand: ZERO, reserved: ZERO, available: ZERO, value: ZERO }));
    return s;
  };
  for (const b of batches) {
    const s = get(b.productId);
    s.onHand = s.onHand.plus(D(b.remaining));
    s.value = s.value.plus(D(b.totalCost).minus(sum(b.consumptions.map((c) => c.cost))));
  }
  for (const it of openItems) {
    const lines = it.product.kind === "BOX" ? it.product.recipe.map((r) => ({ id: r.componentId, q: D(r.quantity).times(it.quantity) })) : [{ id: it.productId, q: D(it.quantity) }];
    for (const l of lines) {
      if (productIds && !productIds.includes(l.id)) continue;
      const s = get(l.id);
      s.reserved = s.reserved.plus(l.q);
    }
  }
  for (const s of map.values()) s.available = s.onHand.minus(s.reserved);
  return map;
}

export async function batchStats(db: Db | Tx, now: Date, windowDays: number) {
  const batches = await db.inventoryBatch.findMany({
    where: { deletedAt: null },
    include: { consumptions: true, product: { select: { name: true, id: true, unit: true } } },
    orderBy: { receivedAt: "desc" },
  });
  return batches.map((b) => {
    const sales = b.consumptions.filter((c) => c.reason === "SALE" || c.reason === "RETURN");
    const soldQty = sum(sales.map((c) => c.quantity));
    const windowEnd = b.receivedAt.getTime() + windowDays * 86400000;
    const soldInWindow = sum(sales.filter((c) => c.date.getTime() <= windowEnd).map((c) => c.quantity));
    const age = ageInDays(b.receivedAt, now);
    const q = D(b.quantity);
    const pct = (x: Decimal) => Number(x.div(q).times(100).toDecimalPlaces(1));
    return {
      id: b.id,
      productId: b.productId,
      productName: b.product.name,
      unit: b.product.unit,
      receivedAt: b.receivedAt,
      quantity: q,
      remaining: D(b.remaining),
      unitCost: D(b.unitCost),
      totalCost: D(b.totalCost),
      supplierName: b.supplierName,
      ageDays: age,
      soldQty,
      sellThroughPct: pct(soldQty),
      sellThroughWindowPct: age >= windowDays ? pct(soldInWindow) : null,
    };
  });
}

/** جرد: يضبط الكمية الفعلية للمنتج. النقص يتخصم FIFO، والزيادة تتسجل دفعة تسوية بآخر تكلفة. */
export async function adjustStock(db: Db, actor: Actor, productId: string, countedQty: DecimalLike, date: Date, note?: string) {
  const counted = qty(countedQty);
  if (!counted.isFinite() || counted.lt(0)) throw new UserError("الكمية لازم تكون ≥ 0");
  return db.$transaction(async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
    const level = (await stockLevels(tx, [productId])).get(productId);
    const onHand = level?.onHand ?? ZERO;
    const diff = counted.minus(onHand);
    if (diff.isZero()) return { diff, value: ZERO };

    let value: Decimal;
    if (diff.lt(0)) {
      const { totalCost } = await consumeFifo(tx, productId, diff.neg(), date, "ADJUSTMENT");
      value = totalCost;
      await postEntry(tx, {
        date,
        description: `جرد: نقص ${diff.neg().toString()} من ${product.name}`,
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
      if (!last) throw new UserError("ما فيه دفعة سابقة نعرف منها التكلفة — سجّل شراء دفعة بدل التسوية");
      value = round2(D(last.unitCost).times(diff));
      const batch = await tx.inventoryBatch.create({
        data: {
          productId,
          receivedAt: date,
          quantity: toDb3(diff),
          remaining: toDb3(diff),
          unitCost: last.unitCost,
          totalCost: toDb2(value),
          paidAmount: "0",
          note: "تسوية جرد (زيادة)",
        },
      });
      const entry = await postEntry(tx, {
        date,
        description: `جرد: زيادة ${diff.toString()} من ${product.name}`,
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
    await audit(tx, actor, "adjust", "Product", productId, { before: { onHand }, after: { counted }, reason: note });
    return { diff, value };
  });
}

/**
 * تكلفة الوحدة التقديرية للتسعير: متوسط المخزون الحالي ← آخر دفعة ← التكلفة التقديرية المسجلة ← غير معروف.
 */
export async function unitCostEstimate(db: Db | Tx, productId: string): Promise<{ cost: Decimal | null; source: "stock" | "last" | "estimate" | null }> {
  const level = (await stockLevels(db, [productId])).get(productId);
  if (level && level.onHand.gt(0)) return { cost: level.value.div(level.onHand), source: "stock" };
  const last = await db.inventoryBatch.findFirst({ where: { productId, deletedAt: null }, orderBy: { receivedAt: "desc" } });
  if (last) return { cost: D(last.unitCost), source: "last" };
  const p = await db.product.findUnique({ where: { id: productId }, select: { estimatedUnitCost: true } });
  if (p?.estimatedUnitCost) return { cost: D(p.estimatedUnitCost), source: "estimate" };
  return { cost: null, source: null };
}

/** تكلفة البوكس من مكوناته */
export async function boxCost(db: Db | Tx, boxId: string) {
  const recipe = await db.recipeLine.findMany({ where: { boxId }, include: { component: { select: { id: true, name: true, unit: true } } } });
  const lines = [];
  let total = ZERO;
  let complete = recipe.length > 0;
  for (const r of recipe) {
    const est = await unitCostEstimate(db, r.componentId);
    const lineCost = est.cost ? round2(est.cost.times(D(r.quantity))) : null;
    if (lineCost) total = total.plus(lineCost);
    else complete = false;
    lines.push({ id: r.id, componentId: r.componentId, name: r.component.name, unit: r.component.unit, quantity: D(r.quantity), unitCost: est.cost, source: est.source, lineCost });
  }
  return { lines, total: round2(total), complete };
}

/** مؤشرات المنتج: الكمية المباعة، الإيراد بدون ضريبة، التكلفة، الهامش الفعلي، سرعة البيع */
export async function productMetrics(db: Db | Tx, productId: string, now: Date) {
  const items = await db.orderItem.findMany({
    where: { productId, order: { status: "DELIVERED", deletedAt: null } },
    include: { order: { select: { id: true, vatRate: true, pricesIncludeVat: true, deliveredAt: true } } },
  });
  let qtySold = 0;
  let revenue = ZERO;
  let cogs = ZERO;
  let recentQty = 0;
  const orders = new Set<string>();
  const since = now.getTime() - 14 * 86400000;
  for (const it of items) {
    qtySold += it.quantity;
    orders.add(it.order.id);
    const rate = D(it.order.vatRate);
    const net = it.order.pricesIncludeVat && rate.gt(0) ? D(it.lineTotal).div(rate.plus(1)) : D(it.lineTotal);
    revenue = revenue.plus(net);
    cogs = cogs.plus(D(it.cogs));
    if (it.order.deliveredAt && it.order.deliveredAt.getTime() >= since) recentQty += it.quantity;
  }
  revenue = round2(revenue);
  const grossProfit = round2(revenue.minus(cogs));
  return {
    qtySold,
    ordersCount: orders.size,
    revenue,
    cogs: round2(cogs),
    grossProfit,
    grossProfitPerOrder: orders.size > 0 ? round2(grossProfit.div(orders.size)) : null,
    marginPct: revenue.gt(0) ? round2(revenue.minus(cogs).div(revenue).times(100)) : null,
    velocityPerDay: Math.round((recentQty / 14) * 100) / 100,
  };
}

/** كام بوكس ممكن يتعمل من المخزون المتاح لمكوناته */
export function boxesAvailable(levels: Map<string, StockLevel>, recipe: { componentId: string; quantity: DecimalLike }[]): number {
  if (recipe.length === 0) return 0;
  let min = Infinity;
  for (const r of recipe) {
    const avail = levels.get(r.componentId)?.available ?? ZERO;
    const n = D(r.quantity).gt(0) ? Math.floor(Number(avail.div(D(r.quantity)))) : 0;
    min = Math.min(min, Math.max(n, 0));
  }
  return min === Infinity ? 0 : min;
}

/** تكلفة تقديرية لكل المنتجات مرة واحدة (للتسعير في عروض الأسعار): البوكس = مجموع مكوناته */
export async function costEstimates(db: Db | Tx): Promise<Map<string, Decimal | null>> {
  const [levels, products, lastBatches] = await Promise.all([
    stockLevels(db),
    db.product.findMany({ where: { deletedAt: null }, select: { id: true, kind: true, estimatedUnitCost: true, recipe: { select: { componentId: true, quantity: true } } } }),
    db.inventoryBatch.findMany({ where: { deletedAt: null }, orderBy: { receivedAt: "desc" }, distinct: ["productId"], select: { productId: true, unitCost: true } }),
  ]);
  const last = new Map(lastBatches.map((b) => [b.productId, D(b.unitCost)]));
  const out = new Map<string, Decimal | null>();
  for (const p of products.filter((p) => p.kind === "GOODS")) {
    const l = levels.get(p.id);
    out.set(p.id, l && l.onHand.gt(0) ? l.value.div(l.onHand) : (last.get(p.id) ?? (p.estimatedUnitCost ? D(p.estimatedUnitCost) : null)));
  }
  for (const p of products.filter((p) => p.kind === "BOX")) {
    let total = ZERO;
    let ok = p.recipe.length > 0;
    for (const r of p.recipe) {
      const c = out.get(r.componentId);
      if (!c) ok = false;
      else total = total.plus(c.times(D(r.quantity)));
    }
    out.set(p.id, ok ? round2(total) : null);
  }
  return out;
}
