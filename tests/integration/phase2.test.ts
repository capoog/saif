import { beforeEach, describe, expect, it } from "vitest";
import { csvToCustomers, normalizePhone } from "@/domain/csv";
import { RuleViolationError } from "@/server/rules";
import { createCustomer, importCustomers, moveDeal, createDeal } from "@/server/services/crm";
import { createBatch } from "@/server/services/inventory";
import { createContractFromQuote, createQuote } from "@/server/services/quotes";
import { createTransaction } from "@/server/services/transactions";
import { acct, actor, at, db, product, resetDb } from "../helpers";

beforeEach(resetDb);

describe("اعتراض القواعد قبل الحفظ", () => {
  it("شراء > 25% من رأس المال يتعترض، والتجاوز بسبب يتسجل", async () => {
    const p = await product(15);
    const bank = await acct("BANK");
    const input = { productId: p.id, receivedAt: at("2026-09-28"), quantity: 1000, unitPrice: "6", paidAmount: "6000", paidFromId: bank.id };
    await expect(createBatch(db, actor, input)).rejects.toBeInstanceOf(RuleViolationError);
    expect(await db.inventoryBatch.count()).toBe(0);
    await createBatch(db, actor, { ...input, override: "صفقة مضمونة بطلب مسبق" });
    expect(await db.inventoryBatch.count()).toBe(1);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "override" } });
    expect(log.reason).toBe("صفقة مضمونة بطلب مسبق");
  });

  it("مصروف ينزّل السيولة تحت 5,000 يتعترض", async () => {
    const bank = await acct("BANK");
    const e = await createTransaction(db, actor, { type: "EXPENSE", date: at("2026-09-28"), amount: "15500", accountId: bank.id, category: "EXP_MARKETING" }).catch((x) => x);
    expect(e).toBeInstanceOf(RuleViolationError);
    expect((e as RuleViolationError).violations.map((v) => v.code)).toEqual(["LIQUIDITY"]);
  });
});

describe("CRM", () => {
  it("CSV عربي بعناوين، وتطبيع الجوال، وتخطي المكرر", async () => {
    expect(normalizePhone("+966 55 123 4567")).toBe("0551234567");
    expect(normalizePhone("٠٥٥١٢٣٤٥٦٧")).toBe("0551234567");
    const csv = 'الاسم,الجوال,النوع,القطاع\n"شركة ""النور""",0551234567,شركة,مقاولات\nأحمد,966500000001,,\n,0500,,\nأحمد مكرر,0500000001,,';
    const parsed = csvToCustomers(csv);
    expect(parsed.customers[0]).toMatchObject({ name: 'شركة "النور"', phone: "0551234567", type: "company" });
    expect(parsed.skipped).toBe(1);
    await createCustomer(db, actor, { name: "موجود", phone: "0551234567" });
    const r = await importCustomers(db, actor, csv);
    expect(r).toEqual({ created: 1, duplicates: 2, skipped: 1 });
  });

  it("خسارة الصفقة لازم يكون ليها سبب", async () => {
    const c = await createCustomer(db, actor, { name: "عميل" });
    const d = await createDeal(db, actor, { customerId: c.id, title: "صفقة" });
    await expect(moveDeal(db, actor, d.id, "LOST")).rejects.toThrow(/سبب/);
    await moveDeal(db, actor, d.id, "LOST", "السعر عالي");
    expect((await db.deal.findUniqueOrThrow({ where: { id: d.id } })).lostReason).toBe("السعر عالي");
  });
});

describe("عروض الأسعار والعقود", () => {
  it("كميات الدفعات لازم تساوي العرض، والبنود لازم تكون منتجات", async () => {
    const c = await createCustomer(db, actor, { name: "شركة", type: "company" });
    const p = await product(5);
    const q = await createQuote(db, actor, { customerId: c.id, date: at("2026-09-28"), items: [{ productId: p.id, description: "بوكس", quantity: 10, unitPrice: "100" }] });
    expect(q.total.toFixed(2)).toBe("1000.00");
    await expect(createContractFromQuote(db, actor, q.id, { signedAt: at("2026-09-29"), deliveries: [{ date: at("2026-10-01"), quantities: [9] }] })).rejects.toThrow(/لازم تساوي/);
    const free = await createQuote(db, actor, { customerId: c.id, date: at("2026-09-28"), items: [{ description: "خدمة تغليف", quantity: 1, unitPrice: "50" }] });
    await expect(createContractFromQuote(db, actor, free.id, { signedAt: at("2026-09-29") })).rejects.toThrow(/مربوطة بمنتج/);
  });

  it("الخصم بيتوزع على الدفعات بنسبة القيمة", async () => {
    const c = await createCustomer(db, actor, { name: "شركة", type: "company" });
    const p = await product(5);
    const q = await createQuote(db, actor, { customerId: c.id, date: at("2026-09-28"), discount: "100", items: [{ productId: p.id, description: "بوكس", quantity: 3, unitPrice: "100" }] });
    const k = await createContractFromQuote(db, actor, q.id, { signedAt: at("2026-09-29"), deliveries: [{ date: at("2026-10-01"), quantities: [1] }, { date: at("2026-10-02"), quantities: [2] }] });
    const orders = await db.order.findMany({ where: { contractId: k.id }, orderBy: { scheduledFor: "asc" } });
    expect(orders.map((o) => o.discount.toFixed(2))).toEqual(["33.33", "66.67"]);
    expect(k.total.toFixed(2)).toBe("200.00");
  });
});

describe("تنبيهات لوحة التحكم", () => {
  it("متابعة فات معادها، ووضع الطوارئ، ودفعة قديمة", async () => {
    const { alerts } = await import("@/server/services/dashboard");
    const { getCapital } = await import("@/server/services/balances");
    const { getSettings } = await import("@/server/services/settings");
    const c = await createCustomer(db, actor, { name: "عميل" });
    await createDeal(db, actor, { customerId: c.id, title: "متابعة", nextFollowUpAt: at("2026-09-28") });
    const p = await product(15);
    const bank = await acct("BANK");
    await createBatch(db, actor, { productId: p.id, receivedAt: at("2026-09-28"), quantity: 10, unitPrice: "5", paidAmount: "50", paidFromId: bank.id });
    await createTransaction(db, actor, { type: "WITHDRAWAL", date: at("2026-09-29"), amount: "6000", accountId: bank.id, category: "OWNER_DRAW", override: "اختبار" });
    const now = at("2026-10-30");
    const titles = (await alerts(db, now, await getSettings(db), await getCapital(db, now))).map((a) => a.title);
    expect(titles).toContain("وضع الطوارئ");
    expect(titles).toContain("1 متابعة فات معادها");
    expect(titles.some((t) => t.startsWith("صفّي:"))).toBe(true);
  });
});
