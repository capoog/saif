/**
 * سيناريو المرحلة 3 — الحساب اليدوي:
 * البداية: البنك 20,000
 * الوكالة: اشتراك 3,000 مدفوع → البنك 23,000 · مهمة مستقل 800 اعتُمدت (مصروف + مستحق) · سداد 500 → البنك 22,500 · مستحق 300
 *   هامش العميل = (3,000 − 800) / 3,000 = 73.33%
 * المشروع (قيمة 10,000، مقدمة 20%):
 *   مقدمة 2,000 → البنك 24,500 (التزام 2,000)
 *   هامش ضمان 1,000 → البنك 23,500 · محجوز 1,000 (في رأس المال، مو في السيولة)
 *   مصروف مواد 3,000 → البنك 20,500
 *   مستخلص 6,000 (خصم مقدمة 1,200) اعتُمد → إيراد 6,000 · رصيد الجهة +4,000
 *   تحصيل 4,800 → البنك 25,300 · رصيد الجهة −800 (باقي المقدمة التزام)
 * ▶ رأس المال = 25,300 + 1,000 − 300 − 800 = 25,200
 *   تحقق: 20,000 + 3,000 − 800 + 6,000 − 3,000 = 25,200 ✔
 * المندوب (عمولة 5%): عقد 2,000 خدمة، اتحصّل واتسلّم → عمولة 100 (مصروف + التزام)
 * ▶ رأس المال = 25,200 + 2,000 − 100 = 27,100
 */
import { beforeAll, describe, expect, it } from "vitest";
import { assertCustomerAccess, assertQuoteAccess } from "@/server/access";
import { agencyOverview, approveTask, chargeSubscription, clientMargins, createSubscription, createTask, freelancerBalances, freelancerUpdateTask, monthKeyOf, saveFreelancer } from "@/server/services/agency";
import { getCapital } from "@/server/services/balances";
import { createCustomer, crmToday, createDeal } from "@/server/services/crm";
import { addPayment, changeOrderStatus } from "@/server/services/orders";
import { addProjectCost, collectInvoice, createInvoice, createProject, projectSummary, receiveAdvance, setGuaranteeMargin, setInvoiceStatus } from "@/server/services/projects";
import { contractDetail, createContractFromQuote, createQuote } from "@/server/services/quotes";
import { getSettings } from "@/server/services/settings";
import { createTransaction } from "@/server/services/transactions";
import { commissionBalances, createUser } from "@/server/services/users";
import { acct, actor, at, db, resetDb } from "../helpers";

// القواعد تفحص رأس المال وقت التنفيذ → العمليات قبل "الحين"
const T = (h: number) => new Date(Date.now() - (10 - h) * 3600000);
const NOW = new Date(Date.now() + 60000);

describe("سيناريو المرحلة 3", () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await resetDb();
    const bank = await acct("BANK");
    ids.bank = bank.id;

    // الوكالة
    const restaurant = await createCustomer(db, actor, { name: "مطعم السنبلة", type: "company" });
    const designer = await saveFreelancer(db, actor, { name: "مصمم حر", skills: "تصميم سوشيال" });
    ids.designer = designer.id;
    const sub = await createSubscription(db, actor, { customerId: restaurant.id, service: "إدارة سوشيال", amount: "3000", startDate: T(1) });
    ids.sub = sub.id;
    await chargeSubscription(db, actor, sub.id, { date: T(1), payment: { accountId: bank.id, method: "transfer" } });
    const task = await createTask(db, actor, { customerId: restaurant.id, subscriptionId: sub.id, title: "تصاميم الأسبوع", freelancerId: designer.id, cost: "800" });
    ids.task = task.id;
    await freelancerUpdateTask(db, actor, designer.id, task.id, "DELIVERED", { url: "https://drive.example/x" });
    await approveTask(db, actor, task.id, T(2));
    await createTransaction(db, actor, { type: "WITHDRAWAL", date: T(2), amount: "500", accountId: bank.id, category: "FREELANCER_PAYMENT", freelancerId: designer.id });

    // المشروع
    const builder = await createCustomer(db, actor, { name: "شركة البناء", type: "company" });
    const p = await createProject(db, actor, { type: "PRIVATE_SUPPLY", name: "توريد مواد", customerId: builder.id, value: "10000", advancePct: "20" });
    ids.project = p.id;
    await receiveAdvance(db, actor, p.id, { amount: "2000", accountId: bank.id, date: T(3) });
    await setGuaranteeMargin(db, actor, p.id, { amount: "1000", accountId: bank.id, date: T(3) });
    await addProjectCost(db, actor, p.id, { amount: "3000", accountId: bank.id, category: "EXP_OTHER", date: T(4), note: "مواد" });
    const inv = await createInvoice(db, actor, p.id, { amount: "6000", date: T(5) });
    ids.inv = inv.id;
    await setInvoiceStatus(db, actor, inv.id, "SUBMITTED", T(5));
    await setInvoiceStatus(db, actor, inv.id, "APPROVED", T(5));
    await collectInvoice(db, actor, inv.id, { amount: "4800", accountId: bank.id, date: T(6) });
  });

  it("الوكالة: الاشتراك، هامش العميل، ومستحقات المستقل", async () => {
    const s = await getSettings(db);
    const m = await clientMargins(db, monthKeyOf(T(1)), s);
    expect(m[0].revenue.toFixed(2)).toBe("3000.00");
    expect(m[0].cost.toFixed(2)).toBe("800.00");
    expect(m[0].marginPct!.toFixed(2)).toBe("73.33");
    expect(m[0].low).toBe(false);
    expect((await freelancerBalances(db)).get(ids.designer)!.due.toFixed(2)).toBe("300.00");
    const o = await agencyOverview(db, NOW);
    expect(o.mrr.toFixed(2)).toBe("3000.00");
    expect(o.clients).toBe(1);
    await expect(chargeSubscription(db, actor, ids.sub, { date: NOW })).rejects.toThrow(/موعده/);
  });

  it("المشروع: المقدمة، المستخلص، التحصيل، والتنبيهات", async () => {
    const cap = await getCapital(db, NOW);
    const s = await projectSummary(db, ids.project, cap.capital, await getSettings(db));
    expect(s.advanceReceived.toFixed(2)).toBe("2000.00");
    expect(s.approved.toFixed(2)).toBe("6000.00");
    expect(s.collected.toFixed(2)).toBe("4800.00");
    expect(s.balance.toFixed(2)).toBe("-800.00");
    expect(s.costs.toFixed(2)).toBe("3000.00");
    expect(s.profit.toFixed(2)).toBe("3000.00");
    expect(s.warnings.some((w) => w.includes("40%"))).toBe(false); // 10,000 ≤ 40% × 25,200
    const small = await projectSummary(db, ids.project, "20000", await getSettings(db));
    expect(small.warnings.some((w) => w.includes("40%"))).toBe(true); // 10,000 > 8,000
    const inv = await db.projectInvoice.findUniqueOrThrow({ where: { id: ids.inv } });
    expect(inv.advanceDeduction.toFixed(2)).toBe("1200.00");
  });

  it("رأس المال يطابق الحساب اليدوي", async () => {
    const c = await getCapital(db, NOW);
    expect(c.cash.toFixed(2)).toBe("25300.00");
    expect(c.restrictedCash.toFixed(2)).toBe("1000.00");
    expect(c.liquidity.toFixed(2)).toBe("25300.00");
    expect(c.customerDeposits.toFixed(2)).toBe("800.00");
    expect(c.freelancerPayable.toFixed(2)).toBe("300.00");
    expect(c.capital.toFixed(2)).toBe("25200.00");
  });

  it("المندوب: يشوف اللي له بس، وعمولته تستحق بعد التحصيل الكامل", async () => {
    const rep = await createUser(db, actor, { name: "مندوب", email: "rep@test.sa", password: "rep-password-1", role: "sales", commissionPct: "5" });
    const repActor = { userId: rep.id, role: "sales" };
    const viewer = { id: rep.id, role: "sales" as const };
    const own = await createCustomer(db, repActor, { name: "عميل المندوب", ownerId: rep.id });
    const other = await db.customer.findFirstOrThrow({ where: { name: "مطعم السنبلة" } });
    await expect(assertCustomerAccess(db, viewer, other.id)).rejects.toThrow(/صلاحية/);
    await assertCustomerAccess(db, viewer, own.id);
    await createDeal(db, repActor, { customerId: own.id, title: "صفقة المندوب", nextFollowUpAt: T(1) });
    expect((await crmToday(db, NOW, rep.id)).deals.map((d) => d.title)).toEqual(["صفقة المندوب"]);

    const service = await db.product.findFirstOrThrow({ where: { kind: "SERVICE" } });
    const q = await createQuote(db, repActor, { customerId: own.id, date: T(7), items: [{ productId: service.id, description: "خدمة", quantity: 1, unitPrice: "2000" }] });
    await expect(assertQuoteAccess(db, { id: "someone-else", role: "sales" }, q.id)).rejects.toThrow();
    const k = await createContractFromQuote(db, actor, q.id, { signedAt: T(7) });
    const order = (await contractDetail(db, k.id))!.orders[0];
    await addPayment(db, actor, order.id, { amount: "2000", method: "transfer", accountId: ids.bank, date: T(8) });
    await changeOrderStatus(db, actor, order.id, "DELIVERED", { date: T(8) });
    expect((await db.b2BContract.findUniqueOrThrow({ where: { id: k.id } })).commissionAccrued!.toFixed(2)).toBe("100.00");
    expect((await commissionBalances(db)).get(rep.id)!.due.toFixed(2)).toBe("100.00");
    expect((await getCapital(db, NOW)).capital.toFixed(2)).toBe("27100.00");
  });

  it("المستقل ما يقدر يعدّل مهمة مو له", async () => {
    const other = await saveFreelancer(db, actor, { name: "مستقل ثاني" });
    await expect(freelancerUpdateTask(db, actor, other.id, ids.task, "IN_PROGRESS")).rejects.toThrow(/مو لك/);
  });

  it("الدفتر متوازن", async () => {
    const s = await db.journalLine.aggregate({ _sum: { debit: true, credit: true } });
    expect(s._sum.debit!.toFixed(2)).toBe(s._sum.credit!.toFixed(2));
  });
});
