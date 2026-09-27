import { D, Decimal, round2, type DecimalLike } from "./money";


export interface FifoBatch {
  id: string;
  receivedAt: Date;
  remaining: number;
  unitCost: DecimalLike;
  /** القيمة المتبقية بالظبط (التكلفة الإجمالية − المخصوم). لو اتحددت، آخر وحدات الدفعة تاخدها كاملة. */
  remainingValue?: DecimalLike;
}

export interface FifoAllocation {
  batchId: string;
  quantity: number;
  unitCost: Decimal;
  cost: Decimal;
}

export class InsufficientStockError extends Error {
  constructor(
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(`المخزون غير كافٍ: مطلوب ${requested}، متاح ${available}`);
  }
}

/** يخصم الكمية من أقدم دفعة للأحدث. التكلفة = مجموع (كمية × تكلفة وحدة كل دفعة). */
export function allocateFifo(batches: FifoBatch[], quantity: number): { allocations: FifoAllocation[]; totalCost: Decimal } {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("الكمية لازم تكون رقم صحيح موجب");
  const sorted = [...batches]
    .filter((b) => b.remaining > 0)
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime() || a.id.localeCompare(b.id));
  const available = sorted.reduce((s, b) => s + b.remaining, 0);
  if (available < quantity) throw new InsufficientStockError(quantity, available);

  const allocations: FifoAllocation[] = [];
  let left = quantity;
  let cost = D(0);
  for (const b of sorted) {
    if (left === 0) break;
    const take = Math.min(left, b.remaining);
    const lineCost =
      take === b.remaining && b.remainingValue !== undefined ? round2(D(b.remainingValue)) : round2(D(b.unitCost).times(take));
    allocations.push({ batchId: b.id, quantity: take, unitCost: D(b.unitCost), cost: lineCost });
    cost = cost.plus(lineCost);
    left -= take;
  }
  return { allocations, totalCost: round2(cost) };
}
