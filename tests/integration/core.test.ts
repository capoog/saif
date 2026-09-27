import { beforeEach, describe, expect, it } from "vitest";
import { getCapital, accountBalances } from "@/server/services/balances";
import { adjustStock, createBatch, stockLevels } from "@/server/services/inventory";
import { addPayment, changeOrderStatus, createOrder } from "@/server/services/orders";
import { createTransaction, deleteTransaction } from "@/server/services/transactions";
import { reconcileAccount } from "@/server/services/close";
import { acct, actor, at, db, product, resetDb, setSetting } from "../helpers";

beforeEach(resetDb);

// كل العمليات في الاختبارات بتواريخ أسبوع 1، فنحسب رأس المال كما في آخر الأسبوع
const NOW = at("2026-10-02", 20);

async function money(code: string) {
  return (await accountBalances(db)).find((b) => b.code === code)!.balance.toFixed(2);
}

async function buy(number: number, qty: number, unitPrice: string, date = at("2026-09-28")) {
  const p = await product(number);
  const bank = await acct("BANK");
  return createBatch(db, actor, { productId: p.id, receivedAt: date, quantity: qty, unitPrice, paidAmount: String(Number(unitPrice) * qty), paidFromId: bank.id });
}

describe("البيانات الأولية", () => {
  it("رأس المال يبدأ 20,000 في البنك", async () => {
    const c = await getCapital(db, NOW);
    expect(c.capital.toFixed(2)).toBe("20000.00");
    expect(await money("BANK")).toBe("20000.00");
    expect(await db.product.count()).toBe(56);
    expect(await db.weeklyTarget.count()).toBe(33);
    expect(await db.engine.count()).toBe(5);
  });
});

describe("الحركات", () => {
  it("المصروف يقلل رأس المال، والحذف بيعكسه ويتسجل في الـ audit", async () => {
    const bank = await acct("BANK");
    const t = await createTransaction(db, actor, { type: "EXPENSE", date: at("2026-09-28"), amount: "250.50", accountId: bank.id, category: "EXP_MARKETING" });
    expect((await getCapital(db, NOW)).capital.toFixed(2)).toBe("19749.50");
    await deleteTransaction(db, actor, t.id, "اتسجل غلط");
    expect((await getCapital(db, NOW)).capital.toFixed(2)).toBe("20000.00");
    expect(await db.auditLog.count({ where: { entity: "Transaction", entityId: t.id } })).toBe(2);
  });
  it("مايسمحش إن حساب نقدي يبقى بالسالب", async () => {
    const box = await acct("CASH_BOX");
    await expect(createTransaction(db, actor, { type: "EXPENSE", date: at("2026-09-28"), amount: "1", accountId: box.id, category: "EXP_OTHER" })).rejects.toThrow(/غير كافٍ/);
  });
  it("التحويل بين الحسابات لا يغيّر رأس المال", async () => {
    const [bank, tax] = [await acct("BANK"), await acct("TAX_RESERVE")];
    await createTransaction(db, actor, { type: "TRANSFER", date: at("2026-09-28"), amount: "1000", accountId: bank.id, toAccountId: tax.id });
    expect(await money("TAX_RESERVE")).toBe("1000.00");
    expect((await getCapital(db, NOW)).capital.toFixed(2)).toBe("20000.00");
  });
  it("تمويل الشريك يزود النقد لكن لا يُحسب في الهدف، والقرض التزام", async () => {
    const bank = await acct("BANK");
    await createTransaction(db, actor, { type: "DEPOSIT", date: at("2026-09-28"), amount: "5000", accountId: bank.id, category: "PARTNER_CAPITAL" });
    await createTransaction(db, actor, { type: "DEPOSIT", date: at("2026-09-28"), amount: "3000", accountId: bank.id, category: "LOAN" });
    const c = await getCapital(db, NOW);
    expect(c.cash.toFixed(2)).toBe("28000.00");
    expect(c.netEquity.toFixed(2)).toBe("25000.00");
    expect(c.capital.toFixed(2)).toBe("20000.00");
  });
});

describe("المخزون والطلبات", () => {
  it("شراء بالآجل: المخزون أصل والمتبقي للمورد التزام", async () => {
    const p = await product(15);
    const bank = await acct("BANK");
    await createBatch(db, actor, { productId: p.id, receivedAt: at("2026-09-28"), quantity: 50, unitPrice: "6", paidAmount: "100", paidFromId: bank.id, supplierName: "مورد" });
    const c = await getCapital(db, NOW);
    expect(c.inventory.toFixed(2)).toBe("300.00");
    expect(c.supplierPayable.toFixed(2)).toBe("200.00");
    expect(c.capital.toFixed(2)).toBe("20000.00");
    expect((await product(15)).status).toBe("TESTING");
  });

  it("العربون التزام لحد التسليم، وبعد التسليم يتحول لإيراد", async () => {
    await buy(15, 10, "5");
    const p = await product(15);
    const bank = await acct("BANK");
    const o = await createOrder(db, actor, {
      date: at("2026-09-29"), channel: "WhatsApp", status: "CONFIRMED",
      items: [{ productId: p.id, quantity: 10, unitPrice: "20" }],
      payment: { amount: "100", method: "transfer", accountId: bank.id },
    });
    let c = await getCapital(db, NOW);
    expect(c.customerDeposits.toFixed(2)).toBe("100.00");
    expect(c.capital.toFixed(2)).toBe("20000.00"); // العربون مش ربح
    expect((await stockLevels(db)).get(p.id)!.available).toBe(0); // محجوز

    await changeOrderStatus(db, actor, o.id, "DELIVERED", { date: at("2026-09-30") });
    c = await getCapital(db, NOW);
    expect(c.customerDeposits.toFixed(2)).toBe("0.00");
    expect(c.receivablesSecured.toFixed(2)).toBe("100.00");
    expect(c.capital.toFixed(2)).toBe("20150.00"); // 200 إيراد − 50 تكلفة
  });

  it("المرتجع يرجّع المخزون ويعكس الإيراد، والاسترداد يرجّع الفلوس", async () => {
    await buy(15, 10, "5");
    const p = await product(15);
    const box = await acct("CASH_BOX");
    const o = await createOrder(db, actor, {
      date: at("2026-09-29"), channel: "مباشر", status: "DELIVERED",
      items: [{ productId: p.id, quantity: 4, unitPrice: "25" }],
      payment: { amount: "100", method: "cash", accountId: box.id },
    });
    expect((await getCapital(db, NOW)).capital.toFixed(2)).toBe("20080.00");
    await changeOrderStatus(db, actor, o.id, "RETURNED", { date: at("2026-09-30"), refund: { accountId: box.id, method: "cash" } });
    const c = await getCapital(db, NOW);
    expect(c.capital.toFixed(2)).toBe("20000.00");
    expect(c.inventory.toFixed(2)).toBe("50.00");
    expect((await stockLevels(db)).get(p.id)!.onHand).toBe(10);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe("REFUNDED");
  });

  it("مرتجع من غير استرداد = مبلغ مستحق للعميل (التزام)", async () => {
    await buy(15, 10, "5");
    const p = await product(15);
    const box = await acct("CASH_BOX");
    const o = await createOrder(db, actor, { date: at("2026-09-29"), channel: "مباشر", status: "DELIVERED", items: [{ productId: p.id, quantity: 2, unitPrice: "25" }], payment: { amount: "50", method: "cash", accountId: box.id } });
    await changeOrderStatus(db, actor, o.id, "RETURNED", { date: at("2026-09-30") });
    const c = await getCapital(db, NOW);
    expect(c.customerDeposits.toFixed(2)).toBe("50.00");
    expect(c.capital.toFixed(2)).toBe("20000.00");
  });

  it("الدفع عند الاستلام: ذمة لحد التحصيل، والذمة المتأخرة > 30 يوم تخرج من رأس المال", async () => {
    await buy(15, 10, "5", at("2026-09-27"));
    const p = await product(15);
    const o = await createOrder(db, actor, { date: at("2026-09-28"), channel: "Instagram", status: "DELIVERED", paymentMethod: "cod", items: [{ productId: p.id, quantity: 2, unitPrice: "30" }] });
    expect((await getCapital(db, at("2026-10-01"))).receivablesSecured.toFixed(2)).toBe("60.00");
    const late = await getCapital(db, at("2026-11-05"));
    expect(late.receivablesSecured.toFixed(2)).toBe("0.00");
    expect(late.receivablesOverdue.toFixed(2)).toBe("60.00");
    await addPayment(db, actor, o.id, { amount: "60", method: "cod", accountId: (await acct("CASH_BOX")).id, date: at("2026-11-06") });
    expect((await getCapital(db, at("2026-11-07"))).capital.toFixed(2)).toBe("20050.00");
  });

  it("الدفع أكتر من المستحق مرفوض، والبيع أكتر من المخزون مرفوض", async () => {
    await buy(15, 2, "5");
    const p = await product(15);
    const box = await acct("CASH_BOX");
    await expect(createOrder(db, actor, { date: at("2026-09-29"), channel: "مباشر", status: "DELIVERED", items: [{ productId: p.id, quantity: 3, unitPrice: "10" }] })).rejects.toThrow(/غير كافٍ/);
    expect(await db.order.count()).toBe(0); // العملية كلها اترجعت
    await expect(createOrder(db, actor, { date: at("2026-09-29"), channel: "مباشر", status: "NEW", items: [{ productId: p.id, quantity: 1, unitPrice: "10" }], payment: { amount: "11", method: "cash", accountId: box.id } })).rejects.toThrow(/أكبر من المتبقي/);
  });

  it("الضريبة المحصّلة لا تدخل في رأس المال، وسدادها لا يغيّره", async () => {
    await setSetting("vatRegistered", true);
    await buy(15, 10, "5");
    const p = await product(15);
    const box = await acct("CASH_BOX");
    await createOrder(db, actor, { date: at("2026-09-29"), channel: "مباشر", status: "DELIVERED", items: [{ productId: p.id, quantity: 1, unitPrice: "115" }], payment: { amount: "115", method: "cash", accountId: box.id } });
    let c = await getCapital(db, NOW);
    expect(c.vatPayable.toFixed(2)).toBe("15.00");
    expect(c.capital.toFixed(2)).toBe("20095.00"); // 100 إيراد − 5 تكلفة
    await createTransaction(db, actor, { type: "WITHDRAWAL", date: at("2026-09-30"), amount: "15", accountId: box.id, category: "VAT_PAYMENT" });
    c = await getCapital(db, NOW);
    expect(c.vatPayable.toFixed(2)).toBe("0.00");
    expect(c.capital.toFixed(2)).toBe("20095.00");
  });

  it("تكلفة الدفعة بتتقفل بالظبط بعد بيعها كلها (مفيش هللات متبقية)", async () => {
    const p = await product(15);
    const bank = await acct("BANK");
    await createBatch(db, actor, { productId: p.id, receivedAt: at("2026-09-28"), quantity: 3, unitPrice: "3", extraCosts: "1", paidAmount: "10", paidFromId: bank.id });
    for (let i = 0; i < 3; i++) {
      await createOrder(db, actor, { date: at("2026-09-29"), channel: "مباشر", status: "DELIVERED", items: [{ productId: p.id, quantity: 1, unitPrice: "10" }] });
    }
    const c = await getCapital(db, NOW);
    expect(c.inventory.toFixed(2)).toBe("0.00");
  });

  it("الجرد: النقص مصروف والزيادة بترجع بآخر تكلفة", async () => {
    await buy(15, 10, "5");
    const p = await product(15);
    await adjustStock(db, actor, p.id, 8, at("2026-10-01"));
    expect((await getCapital(db, NOW)).capital.toFixed(2)).toBe("19990.00");
    await adjustStock(db, actor, p.id, 9, at("2026-10-01"));
    expect((await getCapital(db, NOW)).inventory.toFixed(2)).toBe("45.00");
  });

  it("مطابقة رصيد البنك تسجل الفرق", async () => {
    const bank = await acct("BANK");
    const r = await reconcileAccount(db, actor, bank.id, "19990", at("2026-10-01"));
    expect(r.diff.toFixed(2)).toBe("-10.00");
    expect(await money("BANK")).toBe("19990.00");
  });
});
