import crypto from "node:crypto";
import { prisma } from "@/server/db";
import { notifyEnabled, notifyOwner } from "@/server/notify";
import { dashboardData } from "@/server/services/dashboard";
import { riyadhDateKey } from "@/domain/plan-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ICON = { danger: "🔴", warn: "🟠", info: "🔵" } as const;
const MAX_ALERTS = 15;

/** Vercel Cron يرسل `Authorization: Bearer $CRON_SECRET` تلقائيًا لو المتغير مضبوط. */
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/** ملخص يومي على تيليجرام: رأس المال مقابل الهدف + تنبيهات لوحة التحكم. */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!notifyEnabled()) return Response.json({ ok: false, error: "telegram not configured" }, { status: 503 });

  const now = new Date();
  const d = await dashboardData(prisma, now);
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
  const sent = await notifyOwner(lines.join("\n"));
  return Response.json({ ok: sent, alerts: d.alerts.length }, { status: sent ? 200 : 502 });
}
