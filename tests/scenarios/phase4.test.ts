/**
 * سيناريو المرحلة 4 — الحساب اليدوي (بدون ضريبة):
 * البداية: البنك 20,000 → رأس المال 20,000
 * كافيه (نشاط جديد من الشاشة):
 *   بن 2 كجم × 60 = 120 · حليب 10 لتر × 5 = 50 (من البنك) → مخزون 170، رأس المال ما تغيّر
 *   لاتيه = 0.018 كجم بن + 0.2 لتر حليب → تكلفته 1.08 + 1.00 = 2.08 · سعره 15
 *   بيع سريع 3 لاتيه نقد → الصندوق +45 · التكلفة 6.24 → ربح 38.76
 *   ▶ رأس المال = 20,038.76
 * سلة: شاحن SKU CHG-1، دفعة 10 × 20 = 200
 *   طلب 2 × 50 مدفوع مدى (قيد المراجعة) → عربون 100 (التزام) → رأس المال ما تغيّر
 *   نفس الـ webhook مرتين → طلب واحد ودفعة وحدة
 *   اتسلّم → إيراد 100 − تكلفة 40 = +60 ▶ 20,098.76
 * زد: طلب برمز X-9 ما نعرفه → يحتاج ربط · بعد الربط ينسجل (دفع عند الاستلام) · ينلغي → بدون أثر
 */
import { beforeAll, describe, expect, it } from "vitest";
import { verifySalla, parseSalla } from "@/integrations/stores/salla";
import { parseZid, verifyZid } from "@/integrations/stores/zid";
import { hmacHex } from "@/integrations/stores/types";
import { getCapital } from "@/server/services/balances";
import { businessOverview, createBusiness, quickSale, updateBusiness } from "@/server/services/businesses";
import { createBatch } from "@/server/services/inventory";
import { createProduct } from "@/server/services/products";
import { setRecipe } from "@/server/services/recipes";
import { ingestStoreOrder, mapSku } from "@/server/services/store-sync";
import { acct, actor, db, resetDb } from "../helpers";

const T = (h: number) => new Date(Date.now() - (10 - h) * 3600000);
const NOW = new Date(Date.now() + 60000);
const cap = async () => (await getCapital(db, NOW)).capital.toFixed(2);

const sallaBody = (slug: string) => ({
  event: slug === "under_review" ? "order.created" : "order.status.updated",
  created_at: T(5).toISOString(),
  data: {
    id: 9001,
    reference_id: 55501,
    status: { slug, name: slug },
    payment_method: "mada",
    date: { date: T(5).toISOString() },
    customer: { first_name: "سارة", last_name: "علي", mobile: "501234567", mobile_code: "+966" },
    amounts: { total: { amount: 100 }, shipping_cost: { amount: 0 }, discounts: [] },
    items: [{ name: "شاحن", sku: "CHG-1", quantity: 2, amounts: { total: { amount: 100 } } }],
  },
});
const zidBody = (code: string) => ({
  id: 7007,
  code: "Z-7007",
  order_status: { code },
  created_at: T(6).toISOString(),
  customer: { name: "خالد", mobile: "+966555000111" },
  products: [{ sku: "X-9", name: "شاحن سريع", quantity: 1, price: "50" }],
  payment: { method: { code: "zid_cod" } },
  order_total: "50",
});

describe("سيناريو المرحلة 4", () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await resetDb();
    ids.bank = (await acct("BANK")).id;
  });

  it("نشاط جديد (كافيه) ببيع سريع يخصم المكونات", async () => {
    const cafe = await createBusiness(db, actor, { name: "كافيه الحي", kind: "CAFE", maxCapitalPct: "10" });
    ids.cafe = cafe.id;
    expect(cafe.code).toMatch(/^BIZ_/);
    await expect(createBusiness(db, actor, { name: "كافيه الحي", kind: "CAFE" })).rejects.toThrow(/نفس الاسم/);

    const beans = await createProduct(db, actor, { name: "بن", category: "مواد خام", engineId: cafe.id, unit: "كجم" });
    const milk = await createProduct(db, actor, { name: "حليب", category: "مواد خام", engineId: cafe.id, unit: "لتر" });
    await createBatch(db, actor, { productId: beans.id, receivedAt: T(1), quantity: "2", unitPrice: "60", paidAmount: "120", paidFromId: ids.bank });
    await createBatch(db, actor, { productId: milk.id, receivedAt: T(1), quantity: "10", unitPrice: "5", paidAmount: "50", paidFromId: ids.bank });
    const latte = await createProduct(db, actor, { name: "لاتيه", category: "مشروبات", engineId: cafe.id, kind: "BOX", defaultSellPrice: "15" });
    await setRecipe(db, actor, latte.id, [
      { componentId: beans.id, quantity: "0.018" },
      { componentId: milk.id, quantity: "0.2" },
    ]);
    expect(await cap()).toBe("20000.00");

    const order = await quickSale(db, actor, { engineId: cafe.id, method: "cash", items: [{ productId: latte.id, quantity: 3 }] });
    expect(order.status).toBe("DELIVERED");
    expect(order.paymentStatus).toBe("PAID");
    const items = await db.orderItem.findMany({ where: { orderId: order.id } });
    expect(items[0].cogs!.toFixed(2)).toBe("6.24");
    expect(await cap()).toBe("20038.76");

    const row = (await businessOverview(db, (await getCapital(db, NOW)).capital, NOW)).find((r) => r.id === cafe.id)!;
    expect(row.monthRevenue.toFixed(2)).toBe("45.00");
    expect(row.monthProfit.toFixed(2)).toBe("38.76");

    // صنف من نشاط ثاني مرفوض، والنشاط الموقوف يبقى ببياناته
    const other = await db.product.findFirstOrThrow({ where: { engine: { code: "ECOM" } } });
    await expect(quickSale(db, actor, { engineId: cafe.id, method: "cash", items: [{ productId: other.id, quantity: 1 }] })).rejects.toThrow();
    await updateBusiness(db, actor, cafe.id, { active: false });
    expect((await db.engine.findUniqueOrThrow({ where: { id: cafe.id } })).active).toBe(false);
    await updateBusiness(db, actor, cafe.id, { active: true });
  });

  it("التحقق من توقيع سلة وتوكن زد", () => {
    const raw = JSON.stringify(sallaBody("under_review"));
    const h = (sig: string) => new Headers({ "x-salla-signature": sig });
    expect(verifySalla(raw, h(hmacHex("s3cret", raw)), "s3cret")).toBe(true);
    expect(verifySalla(raw, h(hmacHex("wrong", raw)), "s3cret")).toBe(false);
    expect(verifySalla(raw, h(hmacHex("s3cret", raw)), undefined)).toBe(false);
    expect(verifySalla(raw + " ", h(hmacHex("s3cret", raw)), "s3cret")).toBe(false);
    expect(verifyZid(new URL("https://x/api/webhooks/zid?token=abc"), new Headers(), "abc")).toBe(true);
    expect(verifyZid(new URL("https://x/api/webhooks/zid?token=abd"), new Headers(), "abc")).toBe(false);
    expect(verifyZid(new URL("https://x/api/webhooks/zid"), new Headers(), undefined)).toBe(false);
  });

  it("طلب سلة: ينسجل مرة وحدة، ويتحدث لين التسليم", async () => {
    const ecom = await db.engine.findUniqueOrThrow({ where: { code: "ECOM" } });
    const charger = await createProduct(db, actor, { name: "شاحن", category: "إلكترونيات", engineId: ecom.id, sku: "CHG-1" });
    ids.charger = charger.id;
    await createBatch(db, actor, { productId: charger.id, receivedAt: T(2), quantity: "10", unitPrice: "20", paidAmount: "200", paidFromId: ids.bank });

    const body = sallaBody("under_review");
    const e1 = await ingestStoreOrder(db, parseSalla(body)!, body);
    const e2 = await ingestStoreOrder(db, parseSalla(body)!, body);
    expect(e1.status).toBe("SYNCED");
    expect(e2.orderId).toBe(e1.orderId);
    expect(await db.order.count({ where: { externalSource: "SALLA" } })).toBe(1);
    expect(await db.payment.count({ where: { orderId: e1.orderId! } })).toBe(1);
    const o = await db.order.findUniqueOrThrow({ where: { id: e1.orderId! } });
    expect(o.channel).toBe("سلة / زد");
    expect(o.paymentStatus).toBe("PAID");
    expect(await cap()).toBe("20038.76");

    const delivered = sallaBody("delivered");
    await ingestStoreOrder(db, parseSalla(delivered)!, delivered);
    expect((await db.order.findUniqueOrThrow({ where: { id: e1.orderId! } })).status).toBe("DELIVERED");
    expect(await cap()).toBe("20098.76");

    // webhook قديم وصل متأخر ما يرجّع الحالة
    await ingestStoreOrder(db, parseSalla(body)!, body);
    expect((await db.order.findUniqueOrThrow({ where: { id: e1.orderId! } })).status).toBe("DELIVERED");
  });

  it("طلب زد بمنتج مو مربوط: يعلّق، وبعد الربط ينسجل، والإلغاء بدون أثر", async () => {
    const body = zidBody("new");
    const e = await ingestStoreOrder(db, parseZid(body)!, body);
    expect(e.status).toBe("NEEDS_MAPPING");
    expect(e.missingSkus).toEqual(["X-9"]);
    await expect(mapSku(db, actor, "CHG-1", ids.charger)).resolves.toBe(0);
    const other = await db.product.findFirstOrThrow({ where: { sku: null, kind: "GOODS", engine: { code: "ECOM" } } });
    await expect(mapSku(db, actor, "CHG-1", other.id)).rejects.toThrow(/مربوط/);

    // نربط X-9 بمنتج ثاني له مخزون: نسوي منتج جديد
    const ecom = await db.engine.findUniqueOrThrow({ where: { code: "ECOM" } });
    const fast = await createProduct(db, actor, { name: "شاحن سريع", category: "إلكترونيات", engineId: ecom.id });
    expect(await mapSku(db, actor, "X-9", fast.id)).toBe(1);
    const synced = await db.externalOrder.findUniqueOrThrow({ where: { id: e.id } });
    expect(synced.status).toBe("SYNCED");
    const order = await db.order.findUniqueOrThrow({ where: { id: synced.orderId! } });
    expect(order.paymentStatus).toBe("UNPAID");
    expect(order.status).toBe("NEW");

    const before = await cap();
    const cancelled = zidBody("cancelled");
    await ingestStoreOrder(db, parseZid(cancelled)!, cancelled);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CANCELLED");
    expect(await cap()).toBe(before);
    expect(before).toBe("20098.76");
  });

  it("تسليم بدون مخزون = خطأ ظاهر، والطلب يتعاد بعدين", async () => {
    const ecom = await db.engine.findUniqueOrThrow({ where: { code: "ECOM" } });
    await createProduct(db, actor, { name: "سماعة", category: "إلكترونيات", engineId: ecom.id, sku: "EAR-1" });
    const body = { ...zidBody("delivered"), id: 7008, code: "Z-7008", products: [{ sku: "EAR-1", name: "سماعة", quantity: 1, price: "80" }] };
    const e = await ingestStoreOrder(db, parseZid(body)!, body);
    expect(e.status).toBe("ERROR");
    expect(e.error).toMatch(/مخزون/);
    expect(await db.order.count({ where: { externalId: "7008" } })).toBe(0);
  });

  it("الدفتر متوازن", async () => {
    const s = await db.journalLine.aggregate({ _sum: { debit: true, credit: true } });
    expect(s._sum.debit!.toFixed(2)).toBe(s._sum.credit!.toFixed(2));
  });
});
