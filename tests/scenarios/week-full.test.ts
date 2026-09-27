/**
 * سيناريو أسبوع كامل (معيار قبول المرحلة 1 + القسم 10):
 * شراء، بيع، مرتجع، مصروف إعلان، عربون عميل B2B، عمولة وساطة سيارة، ثم إغلاق الأسبوع.
 *
 * ─────────────── الحساب اليدوي ───────────────
 * البداية: البنك 20,000
 * 1) دفعة 1 معطرات (#15): 100 × 4 + شحن 100 = 500 (تكلفة الوحدة 5) مدفوعة من البنك   → البنك 19,500 | مخزون 500
 * 2) دفعة 2 معطرات: 50 × 6 = 300، مدفوع 100 والباقي 200 آجل للمورد                   → البنك 19,400 | مخزون 800 | موردين 200
 * 3) طلب A مباشر: 120 × 20 = 2,400 نقد، مسلّم. FIFO: 100×5 + 20×6 = 620               → الصندوق 2,400 | مخزون 180
 * 4) طلب B إنستجرام: 10 × 25 = 250 − خصم 10 + شحن 20 = 260، عند الاستلام، مسلّم. تكلفة 10×6 = 60 → ذمة 260 | مخزون 120
 * 5) طلب C: 5 × 20 = 100 مدى، مسلّم (تكلفة 30) ثم مرتجع واسترداد لمدى                → أثر صفر | مخزون 120
 * 6) مصروف إعلان 300 من البنك                                                         → البنك 19,100
 * 7) عقد B2B: 20 بوكس × 150 = 3,000، عربون 50% = 1,500 للبنك، مؤكد (لم يُسلَّم)          → البنك 20,600 | عرابين 1,500
 * 8) عمولة وساطة سيارة 1,000 للبنك (دخل آخر — محرك السيارات)                          → البنك 21,600
 * 9) سداد المورد 200 من البنك                                                          → البنك 21,400 | موردين 0
 *
 * رأس المال قبل الزكاة = نقد (21,400 + 2,400) + مخزون 120 + ذمم 260 − عرابين 1,500 = 22,680
 * تحقق بالأرباح: 20,000 + إيراد (2,400 + 260) − تكلفة (620 + 60) − إعلان 300 + عمولة 1,000 = 22,680 ✔
 * مخصص زكاة شهر الإغلاق (2026-10): 22,680 × 2.5% ÷ 12 = 47.25
 * رأس المال بعد الزكاة = 22,632.75 | هدف نهاية أسبوع 1 = 21,000 | الفارق +1,632.75 (+7.775%) → فوق الهدف
 * القرار: 70% × 1,632.75 = 1,142.93 للمحرك الأعلى عائدًا (منتجات: ربح 1,680 ÷ رأس مال 380 = 442.11%)، و 489.82 للاحتياطي
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getCapital } from "@/server/services/balances";
import { closeWeek } from "@/server/services/close";
import { createBatch, stockLevels } from "@/server/services/inventory";
import { changeOrderStatus, createOrder } from "@/server/services/orders";
import { createTransaction } from "@/server/services/transactions";
import { acct, actor, at, db, product, resetDb } from "../helpers";

describe("سيناريو أسبوع كامل", () => {
  let snapshot: Awaited<ReturnType<typeof closeWeek>>;

  beforeAll(async () => {
    await resetDb();
    const [bank, box, mada] = [await acct("BANK"), await acct("CASH_BOX"), await acct("WALLET_CARDS")];
    const freshener = await product(15);
    const giftBox = await product(5);
    const cars = await db.engine.findUniqueOrThrow({ where: { code: "CARS" } });
    const ecom = await db.engine.findUniqueOrThrow({ where: { code: "ECOM" } });

    // 1 و 2
    await createBatch(db, actor, { productId: freshener.id, receivedAt: at("2026-09-27", 10), quantity: 100, unitPrice: "4", extraCosts: "100", paidAmount: "500", paidFromId: bank.id });
    await createBatch(db, actor, { productId: freshener.id, receivedAt: at("2026-09-28", 10), quantity: 50, unitPrice: "6", paidAmount: "100", paidFromId: bank.id, supplierName: "مورد الرياض" });
    // 3
    await createOrder(db, actor, { date: at("2026-09-28", 15), channel: "مباشر", status: "DELIVERED", items: [{ productId: freshener.id, quantity: 120, unitPrice: "20" }], payment: { amount: "2400", method: "cash", accountId: box.id } });
    // 4
    await createOrder(db, actor, { date: at("2026-09-29", 11), channel: "Instagram", status: "DELIVERED", paymentMethod: "cod", discount: "10", shippingFee: "20", customer: { name: "عميل إنستجرام", phone: "0500000001" }, items: [{ productId: freshener.id, quantity: 10, unitPrice: "25" }] });
    // 5
    const c = await createOrder(db, actor, { date: at("2026-09-29", 13), channel: "TikTok", status: "DELIVERED", items: [{ productId: freshener.id, quantity: 5, unitPrice: "20" }], payment: { amount: "100", method: "mada", accountId: mada.id } });
    await changeOrderStatus(db, actor, c.id, "RETURNED", { date: at("2026-09-30", 10), refund: { accountId: mada.id, method: "mada" } });
    // 6
    await createTransaction(db, actor, { type: "EXPENSE", date: at("2026-09-30", 12), amount: "300", accountId: bank.id, category: "EXP_MARKETING", engineId: ecom.id, note: "إعلان سناب" });
    // 7
    await createOrder(db, actor, { date: at("2026-09-30", 16), channel: "B2B", status: "CONFIRMED", customer: { name: "شركة الأمل" }, items: [{ productId: giftBox.id, quantity: 20, unitPrice: "150" }], payment: { amount: "1500", method: "transfer", accountId: bank.id } });
    // 8
    await createTransaction(db, actor, { type: "DEPOSIT", date: at("2026-10-01", 9), amount: "1000", accountId: bank.id, category: "OTHER_INCOME", engineId: cars.id, note: "عمولة وساطة كامري 2021" });
    // 9
    await createTransaction(db, actor, { type: "WITHDRAWAL", date: at("2026-10-01", 10), amount: "200", accountId: bank.id, category: "SUPPLIER_PAYMENT" });

    // الإغلاق الأسبوعي — الخميس 1 أكتوبر
    snapshot = await closeWeek(db, actor, { asOf: at("2026-10-01", 20), actualDecision: "هزود ميزانية معطرات السيارات" });
  });

  it("مكونات رأس المال تطابق الحساب اليدوي", async () => {
    const b = snapshot.breakdown as Record<string, string>;
    expect(b.cash).toBe("23800");
    expect(b.inventory).toBe("120");
    expect(b.receivablesSecured).toBe("260");
    expect(b.customerDeposits).toBe("1500");
    expect(b.supplierPayable).toBe("0");
    expect(b.vatPayable).toBe("0");
    expect(b.zakatProvision).toBe("47.25");
    expect(snapshot.capital.toFixed(2)).toBe("22632.75");
  });

  it("مقارنة بالهدف والقرار المقترح", () => {
    expect(snapshot.week).toBe(1);
    expect(snapshot.target.toFixed(2)).toBe("21000.00");
    expect(snapshot.gap.toFixed(2)).toBe("1632.75");
    expect(snapshot.status).toBe("above");
    expect(snapshot.suggestedDecision).toContain("1142.93");
    expect(snapshot.suggestedDecision).toContain("منتجات وتجارة إلكترونية");
  });

  it("ربح وعائد كل محرك", () => {
    const engines = snapshot.engines as { code: string; profit: string; capitalUsed: string; returnPct: string | null }[];
    const ecom = engines.find((e) => e.code === "ECOM")!;
    expect(ecom.profit).toBe("1680");
    expect(ecom.capitalUsed).toBe("380");
    expect(ecom.returnPct).toBe("442.11");
    const cars = engines.find((e) => e.code === "CARS")!;
    expect(cars.profit).toBe("1000");
    expect(cars.returnPct).toBeNull();
  });

  it("المخزون الفعلي = قيمة المخزون في الدفتر", async () => {
    const freshener = await product(15);
    const level = (await stockLevels(db)).get(freshener.id)!;
    expect(level.onHand).toBe(20);
    expect(level.value.toFixed(2)).toBe("120.00");
  });

  it("الدفتر متوازن: مجموع المدين = مجموع الدائن", async () => {
    const s = await db.journalLine.aggregate({ _sum: { debit: true, credit: true } });
    expect(s._sum.debit!.toFixed(2)).toBe(s._sum.credit!.toFixed(2));
  });

  it("الـ Snapshot مقفول: إعادة الإغلاق مرفوضة إلا للمالك مع سبب", async () => {
    await expect(closeWeek(db, actor, { asOf: at("2026-10-01", 21) })).rejects.toThrow(/متقفل/);
    await expect(closeWeek(db, actor, { asOf: at("2026-10-01", 21), overwrite: true })).rejects.toThrow(/سبب/);
    await expect(closeWeek(db, { userId: null, role: "sales" }, { asOf: at("2026-10-01", 21), overwrite: true, reason: "x" })).rejects.toThrow();
    const again = await closeWeek(db, actor, { asOf: at("2026-10-01", 21), overwrite: true, reason: "تصحيح" });
    // الزكاة متتحسبش مرتين في نفس الشهر
    expect(again.capital.toFixed(2)).toBe("22632.75");
    expect(await db.auditLog.count({ where: { entity: "WeeklySnapshot", action: "reopen" } })).toBe(1);
  });

  it("رأس المال اللحظي بعد الإغلاق = الـ Snapshot", async () => {
    expect((await getCapital(db, at("2026-10-01", 22))).capital.toFixed(2)).toBe("22632.75");
  });
});
