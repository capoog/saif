import { D, Decimal, round2, type DecimalLike } from "./money";

/** الكميات بـ 3 خانات عشرية (0.5 كجم تمر مثلًا) */
export function qty(v: DecimalLike): Decimal {
  return D(v).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

export interface FifoBatch {
  id: string;
  receivedAt: Date;
  remaining: DecimalLike;
  unitCost: DecimalLike;
  /** القيمة المتبقية بالضبط (التكلفة الإجمالية − المخصوم). لو تحددت، آخر وحدات الدفعة تاخذها كاملة. */
  remainingValue?: DecimalLike;
}

export interface FifoAllocation {
  batchId: string;
  quantity: Decimal;
  unitCost: Decimal;
  cost: Decimal;
}

export class InsufficientStockError extends Error {
  constructor(
    public readonly requested: Decimal,
    public readonly available: Decimal,
  ) {
    super(`المخزون غير كافٍ: مطلوب ${requested}، متاح ${available}`);
  }
}

/** يخصم الكمية من أقدم دفعة للأحدث. التكلفة = مجموع (كمية × تكلفة وحدة كل دفعة). */
export function allocateFifo(batches: FifoBatch[], quantity: DecimalLike): { allocations: FifoAllocation[]; totalCost: Decimal } {
  const need = qty(quantity);
  if (!need.isFinite() || need.lte(0)) throw new Error("الكمية لازم تكون أكبر من صفر");
  const sorted = [...batches]
    .filter((b) => D(b.remaining).gt(0))
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime() || a.id.localeCompare(b.id));
  const available = sorted.reduce((s, b) => s.plus(D(b.remaining)), D(0));
  if (available.lt(need)) throw new InsufficientStockError(need, available);

  const allocations: FifoAllocation[] = [];
  let left = need;
  let cost = D(0);
  for (const b of sorted) {
    if (left.isZero()) break;
    const remaining = D(b.remaining);
    const take = Decimal.min(left, remaining);
    const lineCost =
      take.eq(remaining) && b.remainingValue !== undefined ? round2(D(b.remainingValue)) : round2(D(b.unitCost).times(take));
    allocations.push({ batchId: b.id, quantity: take, unitCost: D(b.unitCost), cost: lineCost });
    cost = cost.plus(lineCost);
    left = left.minus(take);
  }
  return { allocations, totalCost: round2(cost) };
}
