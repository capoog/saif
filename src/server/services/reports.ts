import { D, round2, sum, type Decimal } from "@/domain/money";
import { getPlanStartKey, riyadhDateKey, riyadhEndOfDay, riyadhStartOfDay } from "@/domain/plan-calendar";
import type { Db } from "../db";
import { batchStats } from "./inventory";
import { adsOverview } from "./ads";
import { carTitle, carView } from "./cars";
import { getSettings } from "./settings";

/** شكل موحّد لكل تقرير: نفس البيانات تطلع جدول في الشاشة، و CSV، وورقة Excel */
export type ColType = "text" | "money" | "int" | "pct" | "date";
export interface ReportTable {
  key: string;
  title: string;
  note?: string;
  columns: { key: string; label: string; type: ColType }[];
  rows: Record<string, string | number | null>[];
  total?: Record<string, string | number | null>;
}

export interface Period {
  fromKey: string;
  toKey: string;
}
export function periodOf(from?: string, to?: string, now = new Date()): Period {
  const ok = (k?: string) => (k && /^\d{4}-\d{2}-\d{2}$/.test(k) ? k : undefined);
  const toKey = ok(to) ?? riyadhDateKey(now);
  let fromKey = ok(from) ?? getPlanStartKey();
  if (fromKey > toKey) fromKey = toKey;
  return { fromKey, toKey };
}
const range = (p: Period) => ({ gte: riyadhStartOfDay(p.fromKey), lte: riyadhEndOfDay(p.toKey) });
const n = (d: Decimal) => Number(round2(d).toFixed(2));
const pctOf = (a: Decimal, b: Decimal) => (b.isZero() ? null : Number(a.div(b).times(100).toDecimalPlaces(1)));

/** قائمة الدخل من دفتر القيود: كل حساب إيراد/مصروف، موزّع على المحركات */
export async function incomeStatement(db: Db, p: Period): Promise<ReportTable> {
  const [engines, lines] = await Promise.all([
    db.engine.findMany({ orderBy: { sortOrder: "asc" } }),
    db.journalLine.findMany({
      where: { entry: { date: range(p) }, account: { type: { in: ["INCOME", "EXPENSE"] } } },
      select: { debit: true, credit: true, engineId: true, account: { select: { code: true, name: true, type: true } } },
    }),
  ]);
  const acc = new Map<string, { name: string; type: string; by: Map<string, Decimal> }>();
  for (const l of lines) {
    const e = acc.get(l.account.code) ?? { name: l.account.name, type: l.account.type, by: new Map() };
    // الإيراد موجب والمصروف سالب — المجموع = صافي الربح
    const v = D(l.credit).minus(D(l.debit));
    const k = l.engineId ?? "none";
    e.by.set(k, (e.by.get(k) ?? D(0)).plus(v));
    acc.set(l.account.code, e);
  }
  const cols = [...engines.map((e) => ({ key: e.id, label: e.name })), { key: "none", label: "عام" }];
  const rows = [...acc.entries()]
    .sort((a, b) => (a[1].type === b[1].type ? 0 : a[1].type === "INCOME" ? -1 : 1))
    .map(([, e]) => {
      const r: Record<string, string | number | null> = { account: e.name };
      for (const c of cols) r[c.key] = n(e.by.get(c.key) ?? D(0));
      r.total = n(sum([...e.by.values()]));
      return r;
    });
  const total: Record<string, string | number | null> = { account: "صافي الربح" };
  for (const c of [...cols, { key: "total" }]) total[c.key] = n(sum(rows.map((r) => D(r[c.key] as number))));
  const usedCols = cols.filter((c) => rows.some((r) => r[c.key] !== 0));
  return {
    key: "income",
    title: "قائمة الدخل",
    note: "الإيراد موجب والمصروف سالب. بدون الضريبة المحصّلة (التزام مو إيراد).",
    columns: [{ key: "account", label: "الحساب", type: "text" }, ...usedCols.map((c) => ({ key: c.key, label: c.label, type: "money" as const })), { key: "total", label: "الإجمالي", type: "money" }],
    rows,
    total,
  };
}

/** أفضل وأسوأ المنتجات: الطلبات المسلّمة في الفترة، الإيراد الصافي موزّع على البنود بالنسبة */
export async function productsReport(db: Db, p: Period): Promise<ReportTable> {
  const orders = await db.order.findMany({
    where: { status: "DELIVERED", deliveredAt: range(p), deletedAt: null },
    select: { netRevenue: true, items: { select: { productId: true, quantity: true, lineTotal: true, cogs: true, product: { select: { name: true } } } } },
  });
  const map = new Map<string, { name: string; qty: number; orders: number; revenue: Decimal; cogs: Decimal }>();
  for (const o of orders) {
    const gross = sum(o.items.map((i) => i.lineTotal));
    for (const i of o.items) {
      const e = map.get(i.productId) ?? { name: i.product.name, qty: 0, orders: 0, revenue: D(0), cogs: D(0) };
      e.qty += i.quantity;
      e.orders += 1;
      e.revenue = e.revenue.plus(gross.isZero() ? D(0) : D(o.netRevenue).times(i.lineTotal).div(gross));
      e.cogs = e.cogs.plus(D(i.cogs ?? 0));
      map.set(i.productId, e);
    }
  }
  const rows = [...map.values()]
    .map((e) => ({ product: e.name, qty: e.qty, orders: e.orders, revenue: n(e.revenue), cogs: n(e.cogs), profit: n(e.revenue.minus(e.cogs)), margin: pctOf(e.revenue.minus(e.cogs), e.revenue) }))
    .sort((a, b) => b.profit - a.profit);
  return {
    key: "products",
    title: "المنتجات (الأفضل للأسوأ)",
    note: "مرتبة حسب مجمل الربح. الإيراد بدون ضريبة.",
    columns: [
      { key: "product", label: "المنتج", type: "text" },
      { key: "qty", label: "الكمية", type: "int" },
      { key: "orders", label: "طلبات", type: "int" },
      { key: "revenue", label: "الإيراد", type: "money" },
      { key: "cogs", label: "التكلفة", type: "money" },
      { key: "profit", label: "مجمل الربح", type: "money" },
      { key: "margin", label: "الهامش %", type: "pct" },
    ],
    rows,
    total: { product: "الإجمالي", qty: rows.reduce((s, r) => s + r.qty, 0), orders: null, revenue: n(sum(rows.map((r) => D(r.revenue)))), cogs: n(sum(rows.map((r) => D(r.cogs)))), profit: n(sum(rows.map((r) => D(r.profit)))), margin: null },
  };
}

/** أعمار المخزون: الدفعات اللي فيها باقي، الأقدم أول */
export async function agingReport(db: Db, now = new Date()): Promise<ReportTable> {
  const s = await getSettings(db);
  const batches = (await batchStats(db, now, s.batchWindowDays)).filter((b) => b.remaining.gt(0)).sort((a, b) => b.ageDays - a.ageDays);
  const rows = batches.map((b) => ({
    product: b.productName,
    received: riyadhDateKey(b.receivedAt),
    age: b.ageDays,
    remaining: Number(b.remaining),
    value: n(b.remaining.times(b.unitCost)),
    sold: b.sellThroughPct,
    band: b.ageDays > 90 ? "أكثر من 90" : b.ageDays > 60 ? "61–90" : b.ageDays > 30 ? "31–60" : "0–30",
  }));
  return {
    key: "aging",
    title: "أعمار المخزون",
    note: "الدفعات اللي فيها كمية باقية، الأقدم أول. القيمة بالتكلفة.",
    columns: [
      { key: "product", label: "المنتج", type: "text" },
      { key: "received", label: "الاستلام", type: "date" },
      { key: "age", label: "العمر (يوم)", type: "int" },
      { key: "band", label: "الشريحة", type: "text" },
      { key: "remaining", label: "الباقي", type: "int" },
      { key: "value", label: "القيمة", type: "money" },
      { key: "sold", label: "انباع %", type: "pct" },
    ],
    rows,
    total: { product: "الإجمالي", value: n(sum(rows.map((r) => D(r.value)))) },
  };
}

/** القنوات: طلبات مسلّمة في الفترة لكل قناة */
export async function channelsReport(db: Db, p: Period): Promise<ReportTable> {
  const orders = await db.order.findMany({
    where: { status: "DELIVERED", deliveredAt: range(p), deletedAt: null },
    select: { channel: true, netRevenue: true, items: { select: { cogs: true } } },
  });
  const map = new Map<string, { orders: number; revenue: Decimal; cogs: Decimal }>();
  for (const o of orders) {
    const e = map.get(o.channel) ?? { orders: 0, revenue: D(0), cogs: D(0) };
    e.orders += 1;
    e.revenue = e.revenue.plus(D(o.netRevenue));
    e.cogs = e.cogs.plus(sum(o.items.map((i) => i.cogs ?? 0)));
    map.set(o.channel, e);
  }
  const rows = [...map.entries()]
    .map(([channel, e]) => ({ channel, orders: e.orders, revenue: n(e.revenue), aov: e.orders ? n(e.revenue.div(e.orders)) : 0, profit: n(e.revenue.minus(e.cogs)), margin: pctOf(e.revenue.minus(e.cogs), e.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);
  return {
    key: "channels",
    title: "القنوات",
    columns: [
      { key: "channel", label: "القناة", type: "text" },
      { key: "orders", label: "طلبات", type: "int" },
      { key: "revenue", label: "الإيراد", type: "money" },
      { key: "aov", label: "متوسط الطلب", type: "money" },
      { key: "profit", label: "مجمل الربح", type: "money" },
      { key: "margin", label: "الهامش %", type: "pct" },
    ],
    rows,
    total: { channel: "الإجمالي", orders: rows.reduce((s, r) => s + r.orders, 0), revenue: n(sum(rows.map((r) => D(r.revenue)))), profit: n(sum(rows.map((r) => D(r.profit)))) },
  };
}

export async function adsReport(db: Db): Promise<ReportTable> {
  const { rows, total } = await adsOverview(db);
  return {
    key: "ads",
    title: "الإعلانات",
    note: "من أول ما بدأت الحملات.",
    columns: [
      { key: "name", label: "الحملة", type: "text" },
      { key: "channel", label: "المنصة", type: "text" },
      { key: "product", label: "المنتج", type: "text" },
      { key: "spend", label: "الصرف", type: "money" },
      { key: "orders", label: "طلبات", type: "int" },
      { key: "revenue", label: "المبيعات", type: "money" },
      { key: "cpa", label: "CPA", type: "money" },
      { key: "roas", label: "ROAS", type: "text" },
    ],
    rows: rows.map((r) => ({ name: r.name, channel: r.channel, product: r.productName, spend: n(r.perf.spend), orders: r.perf.orders, revenue: n(r.perf.revenue), cpa: r.perf.cpa ? n(r.perf.cpa) : null, roas: r.perf.roas?.toFixed(2) ?? null })),
    total: { name: "الإجمالي", spend: n(total.spend), orders: total.orders, revenue: n(total.revenue), cpa: total.cpa ? n(total.cpa) : null, roas: total.roas?.toFixed(2) ?? null },
  };
}

const CAR_STATUS_AR: Record<string, string> = { EVALUATING: "تحت الدراسة", LISTED: "معروضة", OWNED: "عندي", SOLD: "مباعة", CANCELLED: "ملغية" };
export async function carsReport(db: Db, now = new Date()): Promise<ReportTable> {
  const s = await getSettings(db);
  const cars = await db.carDeal.findMany({ where: { status: { not: "CANCELLED" } }, include: { costs: true }, orderBy: { number: "desc" } });
  const rows = cars.map((c) => {
    const v = carView(c, s, now);
    return {
      car: `${carTitle(c)} #${c.number}`,
      type: c.type === "PURCHASE" ? "شراء وبيع" : "وساطة",
      status: CAR_STATUS_AR[c.status] ?? c.status,
      cost: v.cost ? n(v.cost) : null,
      sale: c.salePrice ? n(D(c.salePrice)) : null,
      profit: v.profit ? n(v.profit) : null,
      roi: v.roiPct ? Number(v.roiPct.toFixed(1)) : null,
      days: v.holdingDays,
    };
  });
  return {
    key: "cars",
    title: "السيارات",
    columns: [
      { key: "car", label: "السيارة", type: "text" },
      { key: "type", label: "النوع", type: "text" },
      { key: "status", label: "الحالة", type: "text" },
      { key: "cost", label: "التكلفة", type: "money" },
      { key: "sale", label: "سعر البيع", type: "money" },
      { key: "profit", label: "الربح", type: "money" },
      { key: "roi", label: "العائد %", type: "pct" },
      { key: "days", label: "أيام", type: "int" },
    ],
    rows,
    total: { car: "الإجمالي", profit: n(sum(rows.map((r) => D(r.profit ?? 0)))) },
  };
}

export const REPORT_KEYS = ["income", "products", "aging", "channels", "ads", "cars"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];
export const REPORT_TITLES: Record<ReportKey, string> = { income: "قائمة الدخل", products: "المنتجات", aging: "أعمار المخزون", channels: "القنوات", ads: "الإعلانات", cars: "السيارات" };

export async function buildReport(db: Db, key: ReportKey, p: Period, now = new Date()): Promise<ReportTable> {
  switch (key) {
    case "income":
      return incomeStatement(db, p);
    case "products":
      return productsReport(db, p);
    case "aging":
      return agingReport(db, now);
    case "channels":
      return channelsReport(db, p);
    case "ads":
      return adsReport(db);
    case "cars":
      return carsReport(db, now);
  }
}

/** CSV بـ BOM عشان Excel يقرأ العربي صح */
export function toCsv(t: ReportTable): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [t.columns.map((c) => esc(c.label)).join(",")];
  for (const r of [...t.rows, ...(t.total ? [t.total] : [])]) lines.push(t.columns.map((c) => esc(r[c.key])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** ملف Excel: ورقة لكل تقرير، اتجاه من اليمين لليسار، صف عنوان مثبّت */
export async function toXlsx(tables: ReportTable[], period: Period): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "كشف رأس المال";
  const fmt: Record<ColType, string | undefined> = { money: "#,##0.00", int: "#,##0", pct: '0.0"%"', text: undefined, date: undefined };
  for (const t of tables) {
    const ws = wb.addWorksheet(t.title.slice(0, 31), { views: [{ rightToLeft: true, state: "frozen", ySplit: 3 }] });
    ws.addRow([`${t.title} — ${period.fromKey} إلى ${period.toKey}`]).font = { bold: true, size: 13 };
    ws.addRow([t.note ?? ""]).font = { italic: true, color: { argb: "FF666666" } };
    const head = ws.addRow(t.columns.map((c) => c.label));
    head.font = { bold: true };
    head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } }));
    for (const r of t.rows) ws.addRow(t.columns.map((c) => r[c.key] ?? null));
    if (t.total) ws.addRow(t.columns.map((c) => t.total![c.key] ?? null)).font = { bold: true };
    t.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.type === "text" ? 28 : 14;
      if (fmt[c.type]) col.numFmt = fmt[c.type]!;
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
