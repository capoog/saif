import { adPerformance, adStopSignal, type AdPerformance } from "@/domain/rules";
import { D, sum, toDb2, type DecimalLike } from "@/domain/money";
import type { Db } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import type { Override } from "../rules";
import { productMetrics } from "./inventory";
import { getSettings } from "./settings";
import { createTransactionTx, deleteTransaction } from "./transactions";

export const AD_CHANNELS = ["Snapchat", "TikTok", "Instagram", "Google", "X", "مؤثرين", "أخرى"] as const;

export async function createCampaign(db: Db, actor: Actor, input: { name: string; channel: string; productId?: string | null; engineId?: string | null }) {
  if (!input.name?.trim()) throw new UserError("اكتب اسم الحملة");
  return db.$transaction(async (tx) => {
    let engineId = input.engineId ?? null;
    if (!engineId && input.productId) engineId = (await tx.product.findUniqueOrThrow({ where: { id: input.productId } })).engineId;
    if (!engineId) engineId = (await tx.engine.findUniqueOrThrow({ where: { code: "ECOM" } })).id;
    const c = await tx.adCampaign.create({ data: { name: input.name.trim(), channel: input.channel, productId: input.productId || null, engineId } });
    await audit(tx, actor, "create", "AdCampaign", c.id, { after: c });
    return c;
  });
}

export async function setCampaignActive(db: Db, actor: Actor, id: string, active: boolean) {
  return db.$transaction(async (tx) => {
    const c = await tx.adCampaign.update({ where: { id }, data: { active } });
    await audit(tx, actor, "update", "AdCampaign", id, { after: { active } });
    return c;
  });
}

/** إنفاق إعلاني: يتسجل مصروف تسويق على محرك الحملة، ومعاه عدد الطلبات والإيراد لحساب CPA و ROAS */
export async function addAdSpend(
  db: Db,
  actor: Actor,
  input: { campaignId: string; date: Date; amount: DecimalLike; orders: number; revenue: DecimalLike; accountId: string; override?: Override },
) {
  if (!Number.isInteger(input.orders) || input.orders < 0) throw new UserError("عدد الطلبات رقم صحيح");
  if (D(input.revenue).lt(0)) throw new UserError("الإيراد لا يكون سالب");
  return db.$transaction(async (tx) => {
    const c = await tx.adCampaign.findUniqueOrThrow({ where: { id: input.campaignId } });
    const trx = await createTransactionTx(tx, actor, {
      type: "EXPENSE",
      date: input.date,
      amount: D(input.amount).toFixed(2),
      accountId: input.accountId,
      category: "EXP_MARKETING",
      engineId: c.engineId,
      note: `إعلان: ${c.name} (${c.channel})`,
      refType: "AD_SPEND",
      override: input.override,
    });
    const spend = await tx.adSpend.create({
      data: { campaignId: c.id, date: input.date, amount: toDb2(input.amount), orders: input.orders, revenue: toDb2(input.revenue), transactionId: trx.id },
    });
    await tx.transaction.update({ where: { id: trx.id }, data: { refId: spend.id } });
    return spend;
  });
}

export async function deleteAdSpend(db: Db, actor: Actor, id: string, reason: string) {
  const s = await db.adSpend.findUniqueOrThrow({ where: { id } });
  if (s.deletedAt) throw new UserError("انلغى بالفعل");
  if (s.transactionId) await deleteTransaction(db, actor, s.transactionId, reason);
  await db.adSpend.update({ where: { id }, data: { deletedAt: new Date() } });
}

export interface CampaignRow {
  id: string;
  name: string;
  channel: string;
  active: boolean;
  productId: string | null;
  productName: string | null;
  perf: AdPerformance;
}

export async function adsOverview(db: Db, now = new Date()) {
  const settings = await getSettings(db);
  const campaigns = await db.adCampaign.findMany({
    include: { product: { select: { id: true, name: true } }, spends: { where: { deletedAt: null } } },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
  const rows: CampaignRow[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    channel: c.channel,
    active: c.active,
    productId: c.productId,
    productName: c.product?.name ?? null,
    perf: adPerformance(sum(c.spends.map((s) => s.amount)), c.spends.reduce((n, s) => n + s.orders, 0), sum(c.spends.map((s) => s.revenue))),
  }));

  // أداء كل منتج (كل حملاته مع بعض) + قاعدة الإيقاف
  const byProduct = new Map<string, { name: string; spend: ReturnType<typeof D>; orders: number; revenue: ReturnType<typeof D> }>();
  for (const r of rows) {
    if (!r.productId) continue;
    const e = byProduct.get(r.productId) ?? { name: r.productName!, spend: D(0), orders: 0, revenue: D(0) };
    e.spend = e.spend.plus(r.perf.spend);
    e.orders += r.perf.orders;
    e.revenue = e.revenue.plus(r.perf.revenue);
    byProduct.set(r.productId, e);
  }
  const products = [];
  for (const [productId, e] of byProduct) {
    const perf = adPerformance(e.spend, e.orders, e.revenue);
    const m = await productMetrics(db, productId, now);
    products.push({ productId, name: e.name, perf, grossProfitPerOrder: m.grossProfitPerOrder, signal: adStopSignal(perf, m.grossProfitPerOrder, settings) });
  }
  const total = adPerformance(sum(rows.map((r) => r.perf.spend)), rows.reduce((n, r) => n + r.perf.orders, 0), sum(rows.map((r) => r.perf.revenue)));
  return { rows, products, total };
}
