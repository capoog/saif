import "server-only";
import { D, sum } from "@/domain/money";
import { riyadhDateKey, riyadhEndOfDay, riyadhStartOfDay } from "@/domain/plan-calendar";
import type { Db } from "./db";
import { dashboardData } from "./services/dashboard";
import { crmToday } from "./services/crm";

/** ردود تيليجرام (قراءة بس) — نفس النصوص للملخص اليومي (cron) ولأوامر البوت. */

const ICON = { danger: "🔴", warn: "🟠", info: "🔵" } as const;
const MAX_ALERTS = 15;

const ORDER_STATUS: Record<string, string> = {
  NEW: "جديد",
  CONFIRMED: "مؤكد",
  SHIPPED: "مشحون",
  DELIVERED: "مسلّم",
  RETURNED: "مرتجع",
  CANCELLED: "ملغي",
};

const time = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
const money = (v: { toString(): string } | null | undefined) => D(v ?? 0).toFixed(0);

export async function summaryReport(db: Db, now = new Date()) {
  const d = await dashboardData(db, now);
  const lines = [
    `☀️ ملخص ${riyadhDateKey(now)} — الأسبوع ${d.week}`,
    `رأس المال: ${d.cap.capital.toFixed(0)} · هدف اليوم: ${d.targetToday.toFixed(0)} · الفرق: ${d.gap.toFixed(0)} (${d.gapPct.toFixed(1)}%)`,
  ];
  if (d.alerts.length === 0) lines.push("", "✅ ما فيه تنبيهات اليوم.");
  else {
    lines.push("", `التنبيهات (${d.alerts.length}):`);
    for (const a of d.alerts.slice(0, MAX_ALERTS)) lines.push(`${ICON[a.tone]} ${a.title}${a.detail ? ` — ${a.detail}` : ""}`);
    if (d.alerts.length > MAX_ALERTS) lines.push(`+ ${d.alerts.length - MAX_ALERTS} تنبيهات أخرى في لوحة التحكم`);
  }
  return { text: lines.join("\n"), alerts: d.alerts.length };
}

export async function latestOrdersReport(db: Db, take = 10) {
  const orders = await db.order.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take,
    select: { number: true, date: true, status: true, total: true, channel: true, customer: { select: { name: true } } },
  });
  if (!orders.length) return "ما فيه طلبات للحين.";
  return [
    `🧾 آخر ${orders.length} طلبات:`,
    ...orders.map((o) => `#${o.number} · ${o.customer?.name ?? "بدون عميل"} · ${money(o.total)} ريال · ${ORDER_STATUS[o.status] ?? o.status} · ${time(o.date)}`),
  ].join("\n");
}

export async function todayReport(db: Db, now = new Date()) {
  const key = riyadhDateKey(now);
  const range = { gte: riyadhStartOfDay(key), lte: riyadhEndOfDay(key) };
  const [orders, delivered, payments] = await Promise.all([
    db.order.findMany({ where: { deletedAt: null, date: range, status: { notIn: ["CANCELLED", "RETURNED"] } }, select: { total: true } }),
    db.order.count({ where: { deletedAt: null, deliveredAt: range } }),
    db.payment.findMany({ where: { date: range }, select: { amount: true } }),
  ]);
  return [
    `📅 اليوم ${key}`,
    `الطلبات: ${orders.length} · قيمتها ${sum(orders.map((o) => o.total)).toFixed(0)} ريال`,
    `انسلّم: ${delivered} طلب`,
    `المحصّل: ${sum(payments.map((p) => p.amount)).toFixed(0)} ريال`,
  ].join("\n");
}

export async function followUpsReport(db: Db, now = new Date()) {
  const { followUps } = await crmToday(db, now);
  if (!followUps.length) return "✅ ما فيه متابعات مستحقة اليوم.";
  return [
    `📞 متابعات مستحقة (${followUps.length}):`,
    ...followUps.slice(0, 15).map((d) => `• ${d.customer.name}${d.customer.phone ? ` (${d.customer.phone})` : ""} — ${d.title}${d.nextFollowUpAt && d.nextFollowUpAt < now ? " ⏰ متأخرة" : ""}`),
  ].join("\n");
}

export async function loginsReport(db: Db, take = 8) {
  const rows = await db.auditLog.findMany({
    where: { entity: "User", action: { in: ["login", "login_failed"] } },
    orderBy: { createdAt: "desc" },
    take,
    select: { action: true, createdAt: true, user: { select: { name: true } } },
  });
  if (!rows.length) return "ما فيه تسجيلات دخول.";
  return ["🔑 آخر محاولات الدخول:", ...rows.map((r) => `${r.action === "login" ? "✅" : "❌"} ${r.user?.name ?? "؟"} · ${time(r.createdAt)}`)].join("\n");
}
