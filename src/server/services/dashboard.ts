import { D, round2, sum } from "@/domain/money";
import { planWeek, riyadhDateKey, riyadhStartOfDay } from "@/domain/plan-calendar";
import { batchSignal, engineWeakSignal, lossSignals } from "@/domain/rules";
import { compareToTarget } from "@/domain/status";
import { targetForDate } from "@/domain/targets";
import type { CapitalBreakdown } from "@/domain/capital";
import type { Settings } from "@/domain/settings";
import type { Db } from "../db";
import { getCapital } from "./balances";
import { engineWeekResults } from "./close";
import { batchStats } from "./inventory";
import { getSettings } from "./settings";
import { adsOverview } from "./ads";
import { ramadanCounter } from "./b2b";
import { crmToday, overdueFollowUpsCount } from "./crm";

export type AlertTone = "danger" | "warn" | "info";
export interface DashAlert {
  tone: AlertTone;
  title: string;
  detail?: string;
  href?: string;
}

/**
 * كل تنبيهات القسم 5 (غير اللي بتعترض العمليات قبل الحفظ — هذي في server/rules.ts).
 * تتحسب لحظيًا من البيانات، ما فيه شي يتخزن.
 */
export async function alerts(db: Db, now: Date, settings: Settings, cap: CapitalBreakdown): Promise<DashAlert[]> {
  const out: DashAlert[] = [];
  if (cap.capital.lt(settings.emergencyCapital)) {
    out.push({ tone: "danger", title: "وضع الطوارئ", detail: `رأس المال أقل من ${settings.emergencyCapital.toLocaleString("en-US")} — مشتريات المخزون متعترضة. لا مخزون إلا بطلب مدفوع.` });
  }

  // الخسائر: أسوأ طلب في آخر 30 يوم، وصافي الشهر الحالي
  const monthKey = riyadhDateKey(now).slice(0, 7);
  const monthStart = riyadhStartOfDay(`${monthKey}-01`);
  const [recent, monthRows] = await Promise.all([
    db.order.findMany({
      where: { status: "DELIVERED", deletedAt: null, deliveredAt: { gte: new Date(now.getTime() - 30 * 86400000) } },
      select: { number: true, netRevenue: true, items: { select: { cogs: true } } },
    }),
    db.journalLine.findMany({
      where: { entry: { date: { gte: monthStart, lte: now } }, account: { type: { in: ["INCOME", "EXPENSE"] } } },
      select: { debit: true, credit: true },
    }),
  ]);
  const dealProfits = recent.map((o) => ({ n: o.number, p: D(o.netRevenue).minus(sum(o.items.map((i) => i.cogs ?? 0))) }));
  const worst = dealProfits.sort((a, b) => a.p.comparedTo(b.p))[0] ?? null;
  const monthProfit = sum(monthRows.map((l) => D(l.credit).minus(D(l.debit))));
  for (const msg of lossSignals(cap.capital, worst?.p ?? null, monthProfit, settings)) out.push({ tone: "danger", title: "خسارة كبيرة", detail: msg });

  // دفعات المخزون: صفّي / خفّض / أوقف أو خفّض / ضاعف
  const ads = await adsOverview(db, now);
  const adsByProduct = new Map(ads.products.map((p) => [p.productId, p]));
  const stats = await batchStats(db, now, settings.batchWindowDays);
  const seen = new Set<string>();
  for (const b of stats) {
    const a = adsByProduct.get(b.productId);
    const sig = batchSignal(b, a ? { roas: a.perf.roas, orders: a.perf.orders } : null, settings);
    if (!sig || seen.has(`${b.productId}:${sig}`)) continue;
    seen.add(`${b.productId}:${sig}`);
    const href = `/products/${b.productId}`;
    if (sig === "LIQUIDATE") out.push({ tone: "danger", title: `صفّي: ${b.productName}`, detail: `دفعة عمرها ${b.ageDays} يوم وباقي منها ${b.remaining.toString()}.`, href });
    if (sig === "MARKDOWN") out.push({ tone: "warn", title: `خفّض السعر: ${b.productName}`, detail: `دفعة عمرها ${b.ageDays} يوم وباقي منها ${b.remaining.toString()}.`, href });
    if (sig === "SLOW") out.push({ tone: "warn", title: `أوقف أو خفّض: ${b.productName}`, detail: `انباع ${b.sellThroughWindowPct}% بس في أول ${settings.batchWindowDays} يوم.`, href });
    if (sig === "DOUBLE") out.push({ tone: "info", title: `ضاعف ×2: ${b.productName}`, detail: `انباع ${b.sellThroughWindowPct}% في ${settings.batchWindowDays} يوم، و ROAS ${a!.perf.roas!.toFixed(1)} على ${a!.perf.orders} طلب.`, href });
  }

  // الإعلانات: أوقف المنتج
  for (const p of ads.products.filter((p) => p.signal.stop)) {
    out.push({ tone: "danger", title: `أوقف إعلانات: ${p.name}`, detail: p.signal.reason, href: "/ads" });
  }

  // المحركات الضعيفة (من الإغلاقات الأسبوعية)
  const snaps = await db.weeklySnapshot.findMany({ orderBy: { week: "asc" }, select: { engines: true } });
  const history = new Map<string, { name: string; weeks: { profit: string; returnPct: string | null; capitalUsed: string }[] }>();
  for (const sn of snaps) {
    for (const e of sn.engines as { code: string; name: string; profit: string; returnPct: string | null; capitalUsed: string }[]) {
      const h = history.get(e.code) ?? { name: e.name, weeks: [] };
      h.weeks.push(e);
      history.set(e.code, h);
    }
  }
  for (const h of history.values()) {
    const active = h.weeks.filter((w) => D(w.profit).abs().gt(0) || D(w.capitalUsed).gt(0));
    const why = active.length ? engineWeakSignal(h.weeks, settings) : null;
    if (why) out.push({ tone: "danger", title: `أوقف المحرك؟ ${h.name}`, detail: why });
  }

  if (cap.receivablesOverdue.gt(0)) {
    out.push({ tone: "warn", title: "ذمم متأخرة أكثر من 30 يوم", detail: `${cap.receivablesOverdue.toFixed(2)} ريال خارج رأس المال لين التحصيل.`, href: "/orders?filter=unpaid" });
  }

  const overdue = await overdueFollowUpsCount(db, now);
  if (overdue > 0) out.push({ tone: "warn", title: `${overdue} متابعة فات معادها`, href: "/crm" });

  const noInvoice = await db.order.count({ where: { status: "DELIVERED", officialInvoiceNo: null, deletedAt: null } });
  if (noInvoice > 0 && settings.vatRegistered) {
    out.push({ tone: "warn", title: `${noInvoice} طلب مسلّم من غير فاتورة رسمية`, detail: "طلّع الفاتورة من نظام الفوترة المعتمد وسجّل رقمها.", href: "/orders?filter=noinvoice" });
  }

  if (!settings.vatRegistered) {
    const since = new Date(now.getTime() - 365 * 86400000);
    const s = await db.order.aggregate({ where: { status: "DELIVERED", deliveredAt: { gte: since }, deletedAt: null }, _sum: { netRevenue: true } });
    const sales = D(s._sum.netRevenue);
    if (sales.gte(D(settings.vatRegistrationThreshold).times(0.8))) {
      out.push({ tone: "danger", title: "اقتربت من حد التسجيل الإلزامي في ضريبة القيمة المضافة", detail: `مبيعات آخر 12 شهر ${sales.toFixed(2)} من ${settings.vatRegistrationThreshold}.` });
    }
  }
  const rank = { danger: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

export async function dashboardData(db: Db, now = new Date()) {
  const [settings, cap, targets, snapshots] = await Promise.all([
    getSettings(db),
    getCapital(db, now),
    db.weeklyTarget.findMany({ orderBy: { week: "asc" } }),
    db.weeklySnapshot.findMany({ orderBy: { week: "asc" }, select: { week: true, capital: true } }),
  ]);
  const week = planWeek(now);
  const t = targetForDate(targets, now);
  const cmp = compareToTarget(cap.capital, t.today, settings);
  const engines = await engineWeekResults(db, week, now);
  const alertList = await alerts(db, now, settings, cap);
  const [crm, ramadan] = await Promise.all([crmToday(db, now), ramadanCounter(db, now)]);

  const snapByWeek = new Map(snapshots.map((s) => [s.week, s.capital.toString()]));
  const chart = targets.map((row) => ({
    week: row.week,
    target: Number(row.endCapitalTarget),
    actual: row.week === week ? Number(cap.capital) : snapByWeek.has(row.week) ? Number(snapByWeek.get(row.week)) : null,
  }));

  return {
    settings,
    cap,
    week,
    targetToday: t.today,
    targetWeekEnd: t.weekEnd,
    gap: cmp.gap,
    gapPct: round2(cmp.gapPct),
    status: cmp.status,
    engines,
    alerts: alertList,
    chart,
    crm: { activitiesToday: crm.activitiesToday, quotesToday: crm.quotesToday, followUps: crm.followUps.length },
    ramadan,
  };
}
