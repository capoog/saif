import crypto from "node:crypto";
import { after } from "next/server";
import { prisma } from "@/server/db";
import { notifyOwner } from "@/server/notify";
import { followUpsReport, latestOrdersReport, loginsReport, summaryReport, todayReport } from "@/server/telegram-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * بوت تيليجرام (قراءة بس): المالك يرسل أمر ويرجع له تقرير.
 * الحماية: هيدر X-Telegram-Bot-Api-Secret-Token لازم يطابق TELEGRAM_WEBHOOK_SECRET،
 * والرد بس لمحادثة TELEGRAM_CHAT_ID — أي أحد ثاني يتجاهل بصمت.
 */

const HELP = [
  "🤖 أوامر البوت:",
  "الملخص — /summary : رأس المال والتنبيهات",
  "الطلبات — /orders : آخر 10 طلبات",
  "اليوم — /today : طلبات اليوم والمحصّل",
  "المتابعات — /followups : متابعات العملاء المستحقة",
  "الدخول — /logins : آخر محاولات الدخول",
  "مساعدة — /help : هذي القائمة",
].join("\n");

type Command = "help" | "summary" | "orders" | "today" | "followups" | "logins";

const ALIASES: Record<string, Command> = {
  start: "help",
  help: "help",
  مساعدة: "help",
  الاوامر: "help",
  الأوامر: "help",
  summary: "summary",
  الملخص: "summary",
  ملخص: "summary",
  orders: "orders",
  الطلبات: "orders",
  طلبات: "orders",
  today: "today",
  اليوم: "today",
  followups: "followups",
  المتابعات: "followups",
  متابعات: "followups",
  logins: "logins",
  الدخول: "logins",
};

const REPORTS: Record<Command, () => Promise<string>> = {
  help: async () => HELP,
  summary: async () => (await summaryReport(prisma)).text,
  orders: () => latestOrdersReport(prisma),
  today: () => todayReport(prisma),
  followups: () => followUpsReport(prisma),
  logins: () => loginsReport(prisma),
};

function secretOk(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const want = Buffer.from(secret);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/** "/orders@my_bot" أو "الطلبات" → orders */
function parseCommand(text: string): Command | null {
  const word = text.trim().split(/\s+/)[0]?.replace(/^\//, "").replace(/@\S+$/, "").toLowerCase() ?? "";
  return ALIASES[word] ?? null;
}

interface TelegramUpdate {
  message?: { chat?: { id?: number | string }; text?: string };
}

export async function POST(req: Request) {
  if (!secretOk(req)) return new Response("unauthorized", { status: 401 });

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return new Response("ok");
  }
  const chatId = update.message?.chat?.id;
  const text = update.message?.text;
  const owner = process.env.TELEGRAM_CHAT_ID;
  // أي محادثة غير المالك، أو تحديث مو رسالة نصية: نتجاهله بصمت
  if (!owner || chatId === undefined || String(chatId) !== owner.trim() || !text) return new Response("ok");

  const cmd = parseCommand(text);
  // الرد بعد ما نرجّع 200 لتيليجرام، عشان ما يعيد الإرسال لو التقرير أخذ وقت
  after(async () => {
    try {
      await notifyOwner(cmd ? await REPORTS[cmd]() : `ما فهمت 🤔\n\n${HELP}`);
    } catch (e) {
      console.error("telegram bot command failed:", cmd, e instanceof Error ? e.message : "unknown");
      await notifyOwner("صار خطأ وأنا أجيب البيانات، جرّب بعد شوي.");
    }
  });
  return new Response("ok");
}
