/**
 * سيناريو المرحلة 2: مورد ← أمر شراء ← وصفة بوكس ← عميل وصفقة ← عرض سعر ← عقد بدفعتين ← عربون
 * ← تسليم دفعة 1 ← تحصيل ← إعلان ← سداد المورد ← تسليم دفعة 2 ← تحصيل ← العقد يكتمل.
 *
 * ─────────────── الحساب اليدوي ───────────────
 * البداية: البنك 20,000
 * أمر شراء 1 (مصنع): سكري 30 كجم × 25 = 750 + علب 20 × 12 = 240 = 990 + شحن 60 = 1,050
 *   الشحن بنسبة القيمة: سكري 60 × 750/990 = 45.45 → 795.45 (26.515/كجم) · علب الباقي 14.55 → 254.55 (12.7275/علبة)
 *   مدفوع الآن 500 → البنك 19,500 · مستحق للمصنع 550
 * أمر شراء 2 (مطبعة): كروت 20 × 3 = 60 مدفوعة كاملة → البنك 19,440 · المخزون 1,110
 * البوكس = 1.5 كجم سكري + علبة + كرت
 * عرض سعر: 20 بوكس × 150 = 3,000، عربون 50%
 * عقد بدفعتين: 12 بوكس (1,800) و 8 بوكس (1,200)
 * عربون 1,500 للبنك → يتوزع 900 / 600 → البنك 20,940 · عرابين (التزام) 1,500
 * تسليم دفعة 1: سكري 18 × 26.515 = 477.27 · علب 12 × 12.7275 = 152.73 · كروت 12 × 3 = 36 → تكلفة 666.00
 *   الإيراد 1,800 · ذمة 900
 * تحصيل 900 → البنك 21,840
 * إعلان سناب 200 → البنك 21,640
 * سداد المصنع 550 → البنك 21,090 · مستحقات 0
 * ▶ رأس المال = 21,090 + مخزون 444.00 − عرابين 600 = 20,934
 *   تحقق: 20,000 + 1,800 − 666 − 200 = 20,934 ✔
 * تسليم دفعة 2 (باقي المخزون بالظبط = 444.00) + تحصيل 600
 * ▶ رأس المال = البنك 21,690 = 20,000 + 3,000 − 1,110 − 200 ✔ · العقد مكتمل · الصفقة "تم"
 */
import { beforeAll, describe, expect, it } from "vitest";
import { addAdSpend, adsOverview, createCampaign } from "@/server/services/ads";
import { materialNeeds, ramadanCounter } from "@/server/services/b2b";
import { getCapital } from "@/server/services/balances";
import { createCustomer, createDeal, crmToday, logActivity } from "@/server/services/crm";
import { boxCost, stockLevels } from "@/server/services/inventory";
import { addPayment, changeOrderStatus } from "@/server/services/orders";
import { createProduct, updateProduct } from "@/server/services/products";
import { setRecipe } from "@/server/services/recipes";
import { contractDetail, createContractFromQuote, createQuote, recordContractPayment, setQuoteStatus } from "@/server/services/quotes";
import { createPurchaseOrder, createSupplier, receivePurchaseOrder, supplierBalances } from "@/server/services/suppliers";
import { createTransaction } from "@/server/services/transactions";
import { acct, actor, at, db, product, resetDb } from "../helpers";

const NOW = at("2026-10-10", 20);
const cap = () => getCapital(db, NOW).then((c) => c.capital.toFixed(2));

describe("سيناريو B2B رمضان", () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await resetDb();
    const bank = await acct("BANK");
    ids.bank = bank.id;
    const b2b = await db.engine.findUniqueOrThrow({ where: { code: "B2B" } });

    const factory = await createSupplier(db, actor, { name: "مصنع تمور القصيم", type: "منشأة تعبئة", rating: 4 });
    const printer = await createSupplier(db, actor, { name: "مطبعة الرياض", type: "مطبعة" });
    ids.factory = factory.id;
    const dates = await product(1);
    await updateProduct(db, actor, dates.id, { unit: "كجم" });
    const boxPkg = await createProduct(db, actor, { name: "علبة هدايا فاخرة", category: "مواد تعبئة", engineId: b2b.id });
    const card = await createProduct(db, actor, { name: "كرت إهداء بالشعار", category: "مواد تعبئة", engineId: b2b.id });
    ids.dates = dates.id;

    const po1 = await createPurchaseOrder(db, actor, {
      supplierId: factory.id,
      date: at("2026-10-01"),
      extraCosts: "60",
      items: [
        { productId: dates.id, quantity: "30", unitPrice: "25" },
        { productId: boxPkg.id, quantity: "20", unitPrice: "12" },
      ],
    });
    await receivePurchaseOrder(db, actor, po1.id, { date: at("2026-10-02"), paidNow: "500", paidFromId: bank.id });
    const po2 = await createPurchaseOrder(db, actor, { supplierId: printer.id, date: at("2026-10-01"), items: [{ productId: card.id, quantity: "20", unitPrice: "3" }] });
    await receivePurchaseOrder(db, actor, po2.id, { date: at("2026-10-02"), paidNow: "60", paidFromId: bank.id });

    const box = await product(5);
    ids.box = box.id;
    await updateProduct(db, actor, box.id, { kind: "BOX", unit: "بوكس" });
    await setRecipe(db, actor, box.id, [
      { componentId: dates.id, quantity: "1.5" },
      { componentId: boxPkg.id, quantity: "1" },
      { componentId: card.id, quantity: "1" },
    ]);

    const customer = await createCustomer(db, actor, { name: "شركة الأمل", type: "company", phone: "+966 55 123 4567", sector: "مقاولات" });
    const deal = await createDeal(db, actor, { customerId: customer.id, title: "هدايا رمضان للموظفين", engineId: b2b.id, value: "3000", nextFollowUpAt: at("2026-10-03") });
    ids.deal = deal.id;
    await logActivity(db, actor, { type: "call", dealId: deal.id, date: at("2026-10-03", 10), count: 3 });

    const quote = await createQuote(db, actor, {
      customerId: customer.id,
      dealId: deal.id,
      date: at("2026-10-03", 11),
      items: [{ productId: box.id, description: "بوكس تمور فاخر بالشعار", quantity: 20, unitPrice: "150" }],
    });
    await setQuoteStatus(db, actor, quote.id, "SENT");
    const contract = await createContractFromQuote(db, actor, quote.id, {
      signedAt: at("2026-10-04"),
      deliveries: [
        { date: at("2026-10-06"), quantities: [12] },
        { date: at("2026-10-12"), quantities: [8] },
      ],
    });
    ids.contract = contract.id;
    await recordContractPayment(db, actor, contract.id, { amount: "1500", accountId: bank.id, method: "transfer", date: at("2026-10-04") });

    const detail = await contractDetail(db, contract.id);
    ids.order1 = detail!.orders[0].id;
    ids.order2 = detail!.orders[1].id;
    await changeOrderStatus(db, actor, ids.order1, "DELIVERED", { date: at("2026-10-06") });
    await addPayment(db, actor, ids.order1, { amount: "900", method: "transfer", accountId: bank.id, date: at("2026-10-07") });

    const camp = await createCampaign(db, actor, { name: "سناب — بوكسات رمضان", channel: "Snapchat", productId: box.id });
    await addAdSpend(db, actor, { campaignId: camp.id, date: at("2026-10-07"), amount: "200", orders: 0, revenue: "0", accountId: bank.id });
    await createTransaction(db, actor, { type: "WITHDRAWAL", date: at("2026-10-08"), amount: "550", accountId: bank.id, category: "SUPPLIER_PAYMENT", supplierId: factory.id });
  });

  it("أمر الشراء: الشحن اتوزع بنسبة القيمة والمورد عليه الباقي", async () => {
    const batches = await db.inventoryBatch.findMany({ where: { purchaseOrderId: { not: null } }, include: { product: true }, orderBy: { totalCost: "desc" } });
    expect(batches.map((b) => [b.product.name, b.totalCost.toFixed(2)])).toEqual([
      ["سكري (كجم) معبأ", "795.45"],
      ["علبة هدايا فاخرة", "254.55"],
      ["كرت إهداء بالشعار", "60.00"],
    ]);
    expect((await supplierBalances(db)).get(ids.factory)?.toFixed(2)).toBe("0.00");
  });

  it("تكلفة البوكس من مكوناته", async () => {
    const c = await boxCost(db, ids.box);
    // 1.5 × 26.515 + 12.7275 + 3 = 55.50
    expect(c.total.toFixed(2)).toBe("55.50");
    expect(c.complete).toBe(true);
  });

  it("رأس المال في النص يطابق الحساب اليدوي", async () => {
    expect(await cap()).toBe("20934.00");
    const c = await getCapital(db, NOW);
    expect(c.inventory.toFixed(2)).toBe("444.00");
    expect(c.customerDeposits.toFixed(2)).toBe("600.00");
    expect(c.supplierPayable.toFixed(2)).toBe("0.00");
    expect(c.cash.toFixed(2)).toBe("21090.00");
  });

  it("المخزون الباقي يكفي الدفعة التانية بالظبط", async () => {
    const needs = await materialNeeds(db);
    expect(needs.map((n) => [n.name, n.required.toString(), n.shortfall.toString()])).toEqual(
      expect.arrayContaining([
        ["سكري (كجم) معبأ", "12", "0"],
        ["علبة هدايا فاخرة", "8", "0"],
        ["كرت إهداء بالشعار", "8", "0"],
      ]),
    );
    expect((await stockLevels(db, [ids.dates])).get(ids.dates)!.available.toString()).toBe("0");
  });

  it("CRM: الصفقة وصلت لعربون مستلم، والعدّادات", async () => {
    expect((await db.deal.findUniqueOrThrow({ where: { id: ids.deal } })).stage).toBe("DEPOSIT");
    const today = await crmToday(db, at("2026-10-03", 22));
    expect(today.activitiesToday).toBe(3);
    expect(today.quotesToday).toBe(1);
    expect(today.followUps).toHaveLength(1);
    const later = await crmToday(db, at("2026-10-05", 9));
    expect(later.followUps[0].overdue).toBe(true);
  });

  it("عدّاد رمضان: عقد واحد بعربون", async () => {
    const r = await ramadanCounter(db, NOW);
    expect(r.signed).toBe(1);
    expect(r.target).toBe(20);
    expect(r.value.toFixed(2)).toBe("3000.00");
  });

  it("الإعلانات: 200 من غير طلبات لسه تحت حد الإيقاف", async () => {
    const o = await adsOverview(db, NOW);
    expect(o.total.spend.toFixed(2)).toBe("200.00");
    expect(o.products[0].signal.stop).toBe(false);
  });

  it("التسليم التاني والتحصيل يقفلوا العقد والصفقة", async () => {
    await changeOrderStatus(db, actor, ids.order2, "DELIVERED", { date: at("2026-10-12") });
    await addPayment(db, actor, ids.order2, { amount: "600", method: "transfer", accountId: ids.bank, date: at("2026-10-12") });
    const after = await getCapital(db, at("2026-10-12", 23));
    expect(after.capital.toFixed(2)).toBe("21690.00");
    expect(after.inventory.toFixed(2)).toBe("0.00");
    expect((await db.b2BContract.findUniqueOrThrow({ where: { id: ids.contract } })).status).toBe("COMPLETED");
    expect((await db.deal.findUniqueOrThrow({ where: { id: ids.deal } })).stage).toBe("WON");
  });

  it("الدفتر متوازن", async () => {
    const s = await db.journalLine.aggregate({ _sum: { debit: true, credit: true } });
    expect(s._sum.debit!.toFixed(2)).toBe(s._sum.credit!.toFixed(2));
  });
});
