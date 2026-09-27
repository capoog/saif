import { D, round2 } from "@/domain/money";
import { planWeek } from "@/domain/plan-calendar";
import { compareToTarget } from "@/domain/status";
import { targetForDate } from "@/domain/targets";
import type { CapitalBreakdown } from "@/domain/capital";
import type { Settings } from "@/domain/settings";
import type { Db } from "../db";
import { getCapital } from "./balances";
import { engineWeekResults } from "./close";
import { batchStats } from "./inventory";
import { getSettings } from "./settings";

export type AlertTone = "danger" | "warn" | "info";
export interface DashAlert {
  tone: AlertTone;
  title: string;
  detail?: string;
  href?: string;
}

/**
 * تنبيهات المرحلة 1 (قراءة فقط). محرك القواعد الكامل مع اعتراض العمليات قبل الحفظ = المرحلة 2.
 */
export async function basicAlerts(db: Db, now: Date, settings: Settings, cap: CapitalBreakdown): Promise<DashAlert[]> {
  const alerts: DashAlert[] = [];
  if (cap.capital.lt(settings.emergencyCapital)) {
    alerts.push({ tone: "danger", title: "وضع الطوارئ", detail: `رأس المال أقل من ${settings.emergencyCapital.toLocaleString("en-US")} — أوقف شراء المخزون.` });
  }
  if (cap.receivablesOverdue.gt(0)) {
    alerts.push({ tone: "warn", title: "ذمم متأخرة أكتر من 30 يوم", detail: `${cap.receivablesOverdue.toFixed(2)} ريال خارج رأس المال لحد التحصيل.`, href: "/orders?filter=unpaid" });
  }

  const stats = await batchStats(db, now, settings.batchWindowDays);
  for (const b of stats.filter((b) => b.remaining > 0)) {
    if (b.ageDays >= settings.inventoryAgeLiquidateDays) {
      alerts.push({ tone: "danger", title: `صفّي: ${b.productName}`, detail: `دفعة عمرها ${b.ageDays} يوم وباقي منها ${b.remaining}.`, href: `/products/${b.productId}` });
    } else if (b.ageDays >= settings.inventoryAgeMarkdownDays) {
      alerts.push({ tone: "warn", title: `خفّض السعر: ${b.productName}`, detail: `دفعة عمرها ${b.ageDays} يوم وباقي منها ${b.remaining}.`, href: `/products/${b.productId}` });
    } else if (b.sellThroughWindowPct !== null && b.sellThroughWindowPct < settings.batchSlowPct) {
      alerts.push({ tone: "warn", title: `أوقف أو خفّض: ${b.productName}`, detail: `اتباع ${b.sellThroughWindowPct}% بس في أول ${settings.batchWindowDays} يوم.`, href: `/products/${b.productId}` });
    }
  }

  const noInvoice = await db.order.count({ where: { status: "DELIVERED", officialInvoiceNo: null, deletedAt: null } });
  if (noInvoice > 0 && settings.vatRegistered) {
    alerts.push({ tone: "warn", title: `${noInvoice} طلب مسلّم من غير فاتورة رسمية`, detail: "طلّع الفاتورة من نظام الفوترة المعتمد وسجّل رقمها.", href: "/orders?filter=noinvoice" });
  }

  if (!settings.vatRegistered) {
    const since = new Date(now.getTime() - 365 * 86400000);
    const s = await db.order.aggregate({ where: { status: "DELIVERED", deliveredAt: { gte: since }, deletedAt: null }, _sum: { netRevenue: true } });
    const sales = D(s._sum.netRevenue);
    if (sales.gte(D(settings.vatRegistrationThreshold).times(0.8))) {
      alerts.push({ tone: "danger", title: "اقتربت من حد التسجيل الإلزامي في ضريبة القيمة المضافة", detail: `مبيعات آخر 12 شهر ${sales.toFixed(2)} من ${settings.vatRegistrationThreshold}.` });
    }
  }
  return alerts;
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
  const alerts = await basicAlerts(db, now, settings, cap);

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
    alerts,
    chart,
  };
}
