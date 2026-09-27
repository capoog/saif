import "server-only";
import { prisma } from "./db";
import { StorePayloadError, type StoreOrder } from "@/integrations/stores/types";
import { ingestStoreOrder } from "./services/store-sync";

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
  return Response.json({ ok: true, status: ext.status });
}
