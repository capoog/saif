/**
 * السيارات — حساب يدوي:
 * رأس المال 20,000 + إيداع مالك 40,000 = 60,000 (فوق حد الـ 50,000 للشراء)
 * كامري 2021: متوسط السوق (80,000 + 76,000 + 78,000) / 3 = 78,000 → حد الشراء 85% = 66,300
 * سعر الشراء 18,000 (≤ 35% من 60,000 = 21,000) ← لكن قائمة الفحص ناقصة → اعتراض
 * بعد الفحص: شراء 18,000 + تلميع 500 = تكلفة 18,500 · رأس المال ما يتغير (نقد ← سيارة)
 * البيع 21,000 → ربح 2,500 · عائد 13.51% · رأس المال 62,500
 * وساطة: عمولة 2% من 50,000 = 1,000 → رأس المال 63,500
 */
import { beforeEach, describe, expect, it } from "vitest";
import { RuleViolationError } from "@/server/rules";
import { getCapital } from "@/server/services/balances";
import { addCarCost, buyCar, carView, createCar, createCarQuote, sellCar, setChecklist } from "@/server/services/cars";
import { getSettings } from "@/server/services/settings";
import { createCustomer } from "@/server/services/crm";
import { createTransaction } from "@/server/services/transactions";
import { acct, actor, at, db, resetDb } from "../helpers";

const NOW = at("2026-10-20", 20);
// القواعد بتفحص رأس المال وقت التنفيذ، فالإيداع والشراء لازم يكونوا قبل الوقت الحالي
const T0 = new Date(Date.now() - 3 * 3600000);
const T1 = new Date(Date.now() - 2 * 3600000);
beforeEach(resetDb);

describe("السيارات", () => {
  it("شراء وبيع: قواعد الشراء، التكلفة، الربح، ورأس المال", async () => {
    const bank = await acct("BANK");
    const car = await createCar(db, actor, { type: "PURCHASE", make: "تويوتا كامري", year: 2021, mileage: 85000, color: "أبيض", marketPrices: ["80,000", "76000", "78000", ""], askingPrice: "21000" });
    expect(car.marketAvg!.toFixed(2)).toBe("78000.00");

    // رأس المال 20,000 < 50,000
    const e1 = await buyCar(db, actor, car.id, { price: "18000", accountId: bank.id, date: T0 }).catch((x) => x);
    expect((e1 as RuleViolationError).violations.map((v) => v.code).sort()).toEqual(["CAR_CHECKLIST", "CAR_MIN_CAPITAL", "DEAL_SIZE", "INVENTORY_CAP", "LIQUIDITY"].sort());

    await createTransaction(db, actor, { type: "DEPOSIT", date: T0, amount: "40000", accountId: bank.id, category: "OWNER_CAPITAL" });
    const e2 = await buyCar(db, actor, car.id, { price: "18000", accountId: bank.id, date: T0 }).catch((x) => x);
    expect((e2 as RuleViolationError).violations.map((v) => v.code)).toEqual(["CAR_CHECKLIST"]);

    await setChecklist(db, actor, car.id, { inspection: true, vinReport: true, noLiens: true, testDrive: true });
    await buyCar(db, actor, car.id, { price: "18000", accountId: bank.id, date: T0 });
    await addCarCost(db, actor, car.id, { description: "تلميع", amount: "500", accountId: bank.id, date: T1 });
    let c = await getCapital(db, NOW);
    expect(c.capital.toFixed(2)).toBe("60000.00");
    expect(c.inventory.toFixed(2)).toBe("18500.00");

    // يوم 14 و 21
    const s = await getSettings(db);
    const full = await db.carDeal.findUniqueOrThrow({ where: { id: car.id }, include: { costs: true } });
    expect(carView(full, s, new Date(T0.getTime() + 14 * 86400000)).signal?.level).toBe("MARKDOWN");
    const late = carView(full, s, new Date(T0.getTime() + 21 * 86400000));
    expect(late.signal?.level).toBe("SELL_NOW");
    expect(late.signal?.minPrice.toFixed(2)).toBe("17575.00");

    await sellCar(db, actor, car.id, { price: "21000", accountId: bank.id, date: at("2026-10-10") });
    const sold = await db.carDeal.findUniqueOrThrow({ where: { id: car.id }, include: { costs: true } });
    const v = carView(sold, s, NOW);
    expect(v.profit!.toFixed(2)).toBe("2500.00");
    expect(v.roiPct!.toFixed(2)).toBe("13.51");
    c = await getCapital(db, NOW);
    expect(c.capital.toFixed(2)).toBe("62500.00");
    expect(c.inventory.toFixed(2)).toBe("0.00");
  });

  it("شراء بسعر أعلى من 85% من السوق يتعترض", async () => {
    const bank = await acct("BANK");
    await createTransaction(db, actor, { type: "DEPOSIT", date: T0, amount: "80000", accountId: bank.id, category: "OWNER_CAPITAL" });
    const car = await createCar(db, actor, { type: "PURCHASE", make: "هيونداي النترا", year: 2022, marketPrices: ["40000"] });
    await setChecklist(db, actor, car.id, { inspection: true, vinReport: true, noLiens: true, testDrive: true });
    const e = await buyCar(db, actor, car.id, { price: "34001", accountId: bank.id, date: T0 }).catch((x) => x);
    expect((e as RuleViolationError).violations.map((v) => v.code)).toEqual(["CAR_OVERPRICED"]);
    await buyCar(db, actor, car.id, { price: "34001", accountId: bank.id, date: T0, override: "السيارة نظيفة جدًا" });
    expect(await db.auditLog.count({ where: { action: "override", entity: "CarDeal" } })).toBe(1);
  });

  it("وساطة: العمولة بس هي الإيراد، وعرض سعر بمواصفات السيارة", async () => {
    const bank = await acct("BANK");
    const car = await createCar(db, actor, { type: "BROKERAGE", make: "نيسان باترول", year: 2019, mileage: 120000, specs: "فل كامل", askingPrice: "50000", commissionType: "PERCENT", commissionValue: "2", ownerName: "أبو فهد" });
    const s = await getSettings(db);
    expect(carView({ ...car, costs: [] }, s).expectedCommission!.toFixed(2)).toBe("1000.00");
    const buyer = await createCustomer(db, actor, { name: "مشتري", phone: "0555555555" });
    const q = await createCarQuote(db, actor, car.id, { customerId: buyer.id, price: "50000" });
    expect(q.total.toFixed(2)).toBe("50000.00");
    expect(q.carDealId).toBe(car.id);
    await sellCar(db, actor, car.id, { price: "50000", accountId: bank.id, date: at("2026-10-05"), buyerId: buyer.id });
    expect((await getCapital(db, NOW)).capital.toFixed(2)).toBe("21000.00");
  });
});
