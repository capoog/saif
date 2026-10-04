import "server-only";

const MAX_LEN = 4000; // حد تيليجرام 4096 حرف للرسالة
const TIMEOUT_MS = 5000;

/** مفعّل لو TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID موجودين. */
export function notifyEnabled() {
  return !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;
}

/**
 * يرسل تنبيه للمالك على تيليجرام. ما يرمي خطأ أبدًا — لو المتغيرات ناقصة أو الإرسال فشل يرجّع false.
 * نص عادي (بدون Markdown) عشان ما نحتاج escape.
 */
export async function notifyOwner(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, MAX_LEN), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) console.error(`telegram notify failed: HTTP ${res.status}`);
    return res.ok;
  } catch (e) {
    console.error("telegram notify failed:", e instanceof Error ? e.name : "unknown");
    return false;
  }
}
