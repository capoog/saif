import crypto from "node:crypto";
import { prisma } from "@/server/db";
import { notifyEnabled, notifyOwner } from "@/server/notify";
import { summaryReport } from "@/server/telegram-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const { text, alerts } = await summaryReport(prisma);
  const sent = await notifyOwner(text);
  return Response.json({ ok: sent, alerts }, { status: sent ? 200 : 502 });
}
