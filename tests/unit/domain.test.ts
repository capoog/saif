import { describe, expect, it } from "vitest";
import { computeCapital, monthlyZakat } from "@/domain/capital";
import { allocateFifo, InsufficientStockError } from "@/domain/fifo";
import { validateLines, UnbalancedEntryError } from "@/domain/ledger";
import { D } from "@/domain/money";
import { daysRemaining, planDay, planWeek, riyadhStartOfDay, weekRange } from "@/domain/plan-calendar";
import { DEFAULT_SETTINGS, mergeSettings } from "@/domain/settings";
import { compareToTarget, rankEngines, suggestDecision } from "@/domain/status";
import { targetForDate } from "@/domain/targets";
import { computeOrderTotals } from "@/domain/vat";

const riyadh = (key: string, h = 12) => new Date(riyadhStartOfDay(key).getTime() + h * 3600000);

describe("تقويم الخطة", () => {
  it("اليوم 1 = 27 سبتمبر 2026 بتوقيت الرياض", () => {
    expect(planDay(riyadh("2026-09-27", 0))).toBe(1);
    expect(planDay(riyadh("2026-09-27", 23))).toBe(1);
    // 11:30 مساءً بتوقيت UTC يوم 26 = 2:30 فجرًا يوم 27 في الرياض
    expect(planDay(new Date("2026-09-26T23:30:00Z"))).toBe(1);
    expect(planDay(new Date("2026-09-26T20:59:00Z"))).toBe(0);
  });
  it("الأسبوع والأيام المتبقية", () => {
    expect(planWeek(riyadh("2026-10-03"))).toBe(1);
    expect(planWeek(riyadh("2026-10-04"))).toBe(2);
    expect(planDay(riyadh("2027-05-13"))).toBe(229);
    expect(planWeek(riyadh("2027-05-13"))).toBe(33);
    expect(daysRemaining(riyadh("2026-09-27"))).toBe(228);
    expect(weekRange(33)).toEqual({ startKey: "2027-05-09", endKey: "2027-05-13" });
  });
});

describe("الضريبة", () => {
  const items = [{ quantity: 2, unitPrice: "57.50" }];
  it("غير مسجل = بدون ضريبة، والإيراد = الإجمالي", () => {
    const t = computeOrderTotals({ items, vatRegistered: false, vatRatePct: 15, pricesIncludeVat: true });
    expect(t.total.toFixed(2)).toBe("115.00");
    expect(t.vatAmount.toFixed(2)).toBe("0.00");
    expect(t.netRevenue.toFixed(2)).toBe("115.00");
  });
  it("مسجل والأسعار شاملة: الضريبة = الإجمالي × 15/115 ومش جزء من الإيراد", () => {
    const t = computeOrderTotals({ items, shippingFee: "0", vatRegistered: true, vatRatePct: 15, pricesIncludeVat: true });
    expect(t.total.toFixed(2)).toBe("115.00");
    expect(t.vatAmount.toFixed(2)).toBe("15.00");
    expect(t.netRevenue.toFixed(2)).toBe("100.00");
  });
  it("مسجل والأسعار غير شاملة: الضريبة تتضاف", () => {
    const t = computeOrderTotals({ items: [{ quantity: 1, unitPrice: "100" }], discount: "10", shippingFee: "20", vatRegistered: true, vatRatePct: 15, pricesIncludeVat: false });
    expect(t.vatAmount.toFixed(2)).toBe("16.50");
    expect(t.total.toFixed(2)).toBe("126.50");
    expect(t.netRevenue.toFixed(2)).toBe("110.00");
  });
  it("الخصم أكبر من البنود مرفوض", () => {
    expect(() => computeOrderTotals({ items, discount: "200", vatRegistered: false, vatRatePct: 15, pricesIncludeVat: true })).toThrow();
  });
});

describe("FIFO", () => {
  const batches = [
    { id: "b2", receivedAt: new Date("2026-10-02"), remaining: 50, unitCost: "6" },
    { id: "b1", receivedAt: new Date("2026-10-01"), remaining: 100, unitCost: "5" },
  ];
  it("يخصم من الأقدم أولًا", () => {
    const r = allocateFifo(batches, 120);
    expect(r.allocations.map((a) => [a.batchId, a.quantity.toNumber()])).toEqual([["b1", 100], ["b2", 20]]);
    expect(r.totalCost.toFixed(2)).toBe("620.00");
  });
  it("آخر وحدات الدفعة تاخد القيمة المتبقية بالظبط (مفيش فروقات تقريب)", () => {
    const r = allocateFifo([{ id: "x", receivedAt: new Date(), remaining: 1, unitCost: "3.3333", remainingValue: "3.34" }], 1);
    expect(r.totalCost.toFixed(2)).toBe("3.34");
  });
  it("مخزون غير كافٍ", () => {
    expect(() => allocateFifo(batches, 151)).toThrow(InsufficientStockError);
  });
});

describe("القيد المزدوج", () => {
  it("يرفض القيد غير المتوازن", () => {
    expect(() => validateLines([{ accountCode: "A", debit: 10 }, { accountCode: "B", credit: 9.99 }])).toThrow(UnbalancedEntryError);
    expect(validateLines([{ accountCode: "A", debit: 10 }, { accountCode: "B", credit: 10 }]).debit.toFixed(2)).toBe("10.00");
  });
});

describe("حساب رأس المال", () => {
  const base = {
    asOf: riyadh("2026-12-01"),
    cash: "10000",
    wallets: "500",
    inventory: "3000",
    customerBalances: [
      { orderId: "a", balance: "1000", dueFrom: riyadh("2026-11-20") }, // 11 يوم → مضمونة
      { orderId: "b", balance: "400", dueFrom: riyadh("2026-10-15") }, // 47 يوم → متأخرة
      { orderId: "c", balance: "-2000", dueFrom: riyadh("2026-11-30") }, // عربون
    ],
    supplierPayable: "700",
    freelancerPayable: "300",
    loans: "1000",
    vatPayable: "450",
    zakatProvision: "25",
    partnerCapital: "0",
    receivableSecuredDays: 30,
  };
  it("يطبق التعريف بالظبط", () => {
    const c = computeCapital(base);
    // 10,000 + 500 + 3,000 + 1,000 − (700 + 300 + 2,000 + 1,000) − 450 − 25 = 10,025
    expect(c.capital.toFixed(2)).toBe("10025.00");
    expect(c.receivablesSecured.toFixed(2)).toBe("1000.00");
    expect(c.receivablesOverdue.toFixed(2)).toBe("400.00");
    expect(c.customerDeposits.toFixed(2)).toBe("2000.00");
    expect(c.liabilities.toFixed(2)).toBe("4000.00");
    expect(c.liquidity.toFixed(2)).toBe("10500.00");
  });
  it("الذمة عند 30 يوم بالظبط لسه مضمونة", () => {
    const c = computeCapital({ ...base, customerBalances: [{ orderId: "a", balance: "100", dueFrom: riyadh("2026-11-01") }] });
    expect(c.receivablesSecured.toFixed(2)).toBe("100.00");
    const c2 = computeCapital({ ...base, customerBalances: [{ orderId: "a", balance: "100", dueFrom: riyadh("2026-10-31") }] });
    expect(c2.receivablesSecured.toFixed(2)).toBe("0.00");
  });
  it("تمويل الشريك لا يُحسب ضمن الهدف", () => {
    const c = computeCapital({ ...base, cash: "15000", partnerCapital: "5000" });
    expect(c.netEquity.toFixed(2)).toBe("15025.00");
    expect(c.capital.toFixed(2)).toBe("10025.00");
  });
  it("مخصص الزكاة الشهري = 2.5% ÷ 12", () => {
    expect(monthlyZakat("22680", 2.5).toFixed(2)).toBe("47.25");
    expect(monthlyZakat("-100", 2.5).toFixed(2)).toBe("0.00");
  });
});

describe("الهدف والحالة", () => {
  const targets = [
    { week: 1, startCapitalTarget: "20000", endCapitalTarget: "21000" },
    { week: 2, startCapitalTarget: "21000", endCapitalTarget: "23400" },
    { week: 33, startCapitalTarget: "927000", endCapitalTarget: "1000000" },
  ];
  it("هدف اليوم خطي داخل الأسبوع", () => {
    expect(targetForDate(targets, riyadh("2026-09-27")).today.toFixed(2)).toBe("20142.86");
    expect(targetForDate(targets, riyadh("2026-10-03")).today.toFixed(2)).toBe("21000.00");
    expect(targetForDate(targets, riyadh("2027-05-13")).today.toFixed(2)).toBe("1000000.00");
  });
  it("ألوان الحالة", () => {
    const s = DEFAULT_SETTINGS;
    expect(compareToTarget("21700", "21000", s).status).toBe("above"); // +3.33%
    expect(compareToTarget("21630", "21000", s).status).toBe("on"); // +3%
    expect(compareToTarget("20370", "21000", s).status).toBe("on"); // −3%
    expect(compareToTarget("20000", "21000", s).status).toBe("below"); // −4.76%
    expect(compareToTarget("15750", "21000", s).status).toBe("below"); // −25%
    expect(compareToTarget("15700", "21000", s).status).toBe("danger");
  });
  it("القرار المقترح فوق الهدف يوزع الفائض 70/30 على المحرك الأعلى عائدًا", () => {
    const engines = [
      { code: "ECOM", name: "منتجات", profit: D(1680), capitalUsed: D(380), returnPct: D("442.11") },
      { code: "CARS", name: "سيارات", profit: D(1000), capitalUsed: D(0), returnPct: null },
    ];
    expect(rankEngines(engines)[0].code).toBe("ECOM");
    const text = suggestDecision({ status: "above", gap: D("1632.75"), engines, settings: DEFAULT_SETTINGS });
    expect(text).toContain("1142.93");
    expect(text).toContain("489.82");
    expect(text).toContain("منتجات");
  });
  it("الإعدادات المخزنة بتتدمج فوق الافتراضي وتتجاهل الأنواع الغلط", () => {
    const s = mergeSettings({ maxDealPct: 30, vatRegistered: "yes" });
    expect(s.maxDealPct).toBe(30);
    expect(s.vatRegistered).toBe(false);
  });
  it("اسم المنشأة الفاضي يرجع للافتراضي", () => {
    expect(mergeSettings({ businessName: "" }).businessName).toBe("الغباشي للمقاولات والتجارة");
    expect(mergeSettings({ businessName: "اسم ثاني" }).businessName).toBe("اسم ثاني");
  });
});
