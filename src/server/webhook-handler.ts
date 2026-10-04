import "server-only";
import { after } from "next/server";
import { prisma } from "./db";
import { StorePayloadError, type StoreOrder } from "@/integrations/stores/types";
import { ingestStoreOrder } from "./services/store-sync";
import { notifyOwner } from "./notify";

const MAX_BODY = 1_000_000;

/** مشترك بين سلة وزد: تحقق ← تحليل ← تسجيل. يرجّع 200 حتى لو الطلب يحتاج ربط، عشان المنصة ما تعيد الإرسال بلا فايدة. */
export async function handleStoreWebhook(req: Request, verify: (raw: string) => boolean, parse: (body: unknown) => StoreOrder | null) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ ok: false, error: "too large" }, { status: 413 });
  if (!verify(raw)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  let so: StoreOrder | null;
  try {
    so = parse(body);
  } catch (e) {
    if (e instanceof StorePayloadError) return Response.json({ ok: false, error: e.message }, { status: 422 });
    throw e;
  }
  if (!so) return Response.json({ ok: true, ignored: true });
  const ext = await ingestStoreOrder(prisma, so, body);
  // تنبيه أول وصول للطلب بس (المنصات تعيد إرسال نفس الطلب مع كل تحديث حالة)
  const order = so;
  if (ext.attempts === 1 && ext.status !== "IGNORED") after(() => notifyOwner(storeOrderMessage(order, ext.status, ext.missingSkus)));
  return Response.json({ ok: true, status: ext.status });
}

const SOURCE_LABEL: Record<string, string> = { SALLA: "سلة", ZID: "زد" };

function storeOrderMessage(so: StoreOrder, status: string, missingSkus: string[]) {
  const lines = [`🛒 طلب جديد من ${SOURCE_LABEL[so.source] ?? so.source}${so.reference ? ` #${so.reference}` : ""}`];
  lines.push(`العميل: ${so.customer.name}`);
  if (so.total) lines.push(`الإجمالي: ${so.total} ريال${so.paid ? " (مدفوع)" : ""}`);
  lines.push(`المنتجات: ${so.items.map((i) => `${i.name} ×${i.quantity}`).join("، ") || "—"}`);
  if (status === "NEEDS_MAPPING") lines.push(`⚠️ ما انسجل — منتجات تحتاج ربط: ${missingSkus.join("، ") || "—"}`);
  if (status === "ERROR") lines.push("⚠️ ما انسجل — فيه خطأ، شوف صفحة الربط.");
  return lines.join("\n");
}
