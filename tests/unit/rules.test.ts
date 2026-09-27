import { describe, expect, it } from "vitest";
import { allocateFifo } from "@/domain/fifo";
import { D } from "@/domain/money";
import { adPerformance, adStopSignal, batchSignal, checkOperation, engineWeakSignal, lossSignals } from "@/domain/rules";
import { DEFAULT_SETTINGS as S } from "@/domain/settings";

const cap = (capital: number, liquidity: number, inventory = 0, deposits = 0) => ({
  capital: D(capital),
  liquidity: D(liquidity),
  inventory: D(inventory),
  customerDeposits: D(deposits),
});
const codes = (v: { code: string }[]) => v.map((x) => x.code).sort();

describe("FIFO بكميات عشرية", () => {
  it("يخصم كسور الكيلو ويحسب التكلفة", () => {
    const r = allocateFifo([{ id: "a", receivedAt: new Date(1), remaining: "1.5", unitCost: "40" }, { id: "b", receivedAt: new Date(2), remaining: "10", unitCost: "50" }], "2.25");
    expect(r.allocations.map((a) => [a.batchId, a.quantity.toString()])).toEqual([["a", "1.5"], ["b", "0.75"]]);
    expect(r.totalCost.toFixed(2)).toBe("97.50");
  });
});

describe("قواعد الاعتراض", () => {
  it("عملية عادية تعدّي", () => {
    expect(checkOperation({ kind: "INVENTORY_PURCHASE", amount: 3000, cashOut: 3000, inventoryIn: 3000 }, cap(20000, 20000), S)).toEqual([]);
  });
  it("صفقة > 25% من رأس المال", () => {
    const v = checkOperation({ kind: "INVENTORY_PURCHASE", amount: 5001, cashOut: 0, inventoryIn: 5001 }, cap(20000, 20000), S);
    expect(codes(v)).toEqual(["DEAL_SIZE"]);
    expect(checkOperation({ kind: "INVENTORY_PURCHASE", amount: 5000, cashOut: 0, inventoryIn: 5000 }, cap(20000, 20000), S)).toEqual([]);
  });
  it("السيارات: 35% بعد 50 ألف، وممنوع الشراء تحت 50 ألف", () => {
    expect(codes(checkOperation({ kind: "CAR_PURCHASE", amount: 17000, cashOut: 0 }, cap(60000, 60000), S))).toEqual([]);
    expect(codes(checkOperation({ kind: "CAR_PURCHASE", amount: 21001, cashOut: 0 }, cap(60000, 60000), S))).toEqual(["DEAL_SIZE"]);
    expect(codes(checkOperation({ kind: "CAR_PURCHASE", amount: 5000, cashOut: 0 }, cap(40000, 40000), S))).toEqual(["CAR_MIN_CAPITAL"]);
  });
  it("السيولة تحت 15% أو تحت 5,000", () => {
    // رأس مال 20,000: الحد = max(3,000 ، 5,000) = 5,000
    expect(codes(checkOperation({ kind: "CASH_OUT", amount: 15001, cashOut: 15001 }, cap(20000, 20000), S))).toEqual(["LIQUIDITY"]);
    expect(checkOperation({ kind: "CASH_OUT", amount: 1000, cashOut: 1000, capitalChange: -1000 }, cap(20000, 20000), S)).toEqual([]);
    // رأس مال 100,000: الحد 15,000
    expect(codes(checkOperation({ kind: "CASH_OUT", amount: 6000, cashOut: 6000 }, cap(100000, 20000), S))).toEqual(["LIQUIDITY"]);
  });
  it("المخزون > 50%، ويوصل 60% لو الزيادة مغطاة بعرابين", () => {
    const op = { kind: "INVENTORY_PURCHASE" as const, amount: 3000, cashOut: 0, inventoryIn: 3000 };
    expect(codes(checkOperation(op, cap(20000, 20000, 8000), S))).toEqual(["INVENTORY_CAP"]); // 11,000 > 10,000
    expect(checkOperation(op, cap(20000, 20000, 8000, 1000), S)).toEqual([]); // الزيادة 1,000 مغطاة، و 11,000 ≤ 12,000
    expect(codes(checkOperation({ ...op, amount: 4001, inventoryIn: 4001 }, cap(20000, 20000, 8000, 5000), S))).toEqual(["INVENTORY_CAP"]); // > 60%
  });
  it("وضع الطوارئ يجمّد شراء المخزون بس", () => {
    expect(codes(checkOperation({ kind: "INVENTORY_PURCHASE", amount: 100, cashOut: 0, inventoryIn: 100 }, cap(14999, 14999), S))).toContain("EMERGENCY");
    expect(checkOperation({ kind: "CASH_OUT", amount: 100, cashOut: 100 }, cap(14999, 14999), S).map((x) => x.code)).not.toContain("EMERGENCY");
  });
});

describe("إشارات التنبيه", () => {
  it("دفعات المخزون", () => {
    expect(batchSignal({ ageDays: 30, remaining: 5, sellThroughWindowPct: 90 }, null, S)).toBe("LIQUIDATE");
    expect(batchSignal({ ageDays: 21, remaining: 5, sellThroughWindowPct: 90 }, null, S)).toBe("MARKDOWN");
    expect(batchSignal({ ageDays: 15, remaining: 80, sellThroughWindowPct: 20 }, null, S)).toBe("SLOW");
    expect(batchSignal({ ageDays: 15, remaining: 10, sellThroughWindowPct: 75 }, { roas: D(3.2), orders: 25 }, S)).toBe("DOUBLE");
    expect(batchSignal({ ageDays: 15, remaining: 10, sellThroughWindowPct: 75 }, { roas: D(3.2), orders: 19 }, S)).toBeNull();
    expect(batchSignal({ ageDays: 5, remaining: 10, sellThroughWindowPct: null }, null, S)).toBeNull();
  });
  it("الإعلانات: CPA و ROAS وقاعدة الإيقاف", () => {
    const p = adPerformance("1200", 20, "3000");
    expect(p.cpa!.toFixed(2)).toBe("60.00");
    expect(p.roas!.toFixed(2)).toBe("2.50");
    expect(adStopSignal(p, "100", S).stop).toBe(true); // 60 > 40% × 100
    expect(adStopSignal(p, "200", S).stop).toBe(false); // 60 ≤ 80
    expect(adStopSignal(adPerformance("900", 0, "0"), "100", S).stop).toBe(false); // قبل حد الـ 1,000
    expect(adStopSignal(adPerformance("1000", 0, "0"), null, S).stop).toBe(true); // 1,000 من غير طلبات
  });
  it("المحرك الضعيف", () => {
    const w = (profit: number, ret: number | null, cap = 1000) => ({ profit, returnPct: ret, capitalUsed: cap });
    expect(engineWeakSignal([w(10, 1), w(-5, -1)], S)).toBeNull();
    expect(engineWeakSignal([w(10, 1), w(-5, -1), w(-3, -1)], S)).toContain("أسبوعين");
    expect(engineWeakSignal([w(10, 1), w(10, 1), w(10, 1), w(10, 1)], S)).toContain("4 أسابيع");
    expect(engineWeakSignal([w(10, 2), w(10, 2), w(10, 2), w(10, 2)], S)).toBeNull();
  });
  it("خسارة الصفقة والشهر", () => {
    expect(lossSignals(20000, -1001, 0, S)).toHaveLength(1);
    expect(lossSignals(20000, -1000, -2001, S)).toHaveLength(1);
    expect(lossSignals(20000, 50, 100, S)).toEqual([]);
  });
});

describe("قواعد السيارات", () => {
  it("متوسط السوق والعمولة", async () => {
    const { marketAverage, brokerageCommission, checkCarPurchase } = await import("@/domain/rules");
    expect(marketAverage(["100", "", "0", "200"])!.toFixed(2)).toBe("150.00");
    expect(marketAverage([])).toBeNull();
    expect(brokerageCommission("PERCENT", "2.5", "40000").toFixed(2)).toBe("1000.00");
    expect(brokerageCommission("FIXED", "1500", "40000").toFixed(2)).toBe("1500.00");
    expect(checkCarPurchase({}, 1, null, S).map((v) => v.code)).toEqual(["CAR_CHECKLIST", "CAR_OVERPRICED"]);
  });
});
