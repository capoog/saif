import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/server/db";
import { STORE_LABEL, integrationStatus } from "@/server/services/store-sync";
import { dateTime } from "@/lib/format";
import { Badge, Card, CardTitle, Empty, PageHeader } from "@/components/ui";
import { CopyField, MapSkuForm, RetryButton } from "./client";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  SYNCED: { label: "انسجل", tone: "ok" },
  NEEDS_MAPPING: { label: "يحتاج ربط منتج", tone: "warn" },
  ERROR: { label: "خطأ", tone: "danger" },
  IGNORED: { label: "ملغي من المتجر", tone: "neutral" },
};

export default async function IntegrationsPage() {
  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const on = integrationStatus();
  const [orders, products] = await Promise.all([
    prisma.externalOrder.findMany({ orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 50 }),
    prisma.product.findMany({ where: { deletedAt: null, kind: { not: "SERVICE" } }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, engine: { select: { name: true } } } }),
  ]);
  const opts = products.map((p) => ({ id: p.id, label: `${p.name} · ${p.engine.name}${p.sku ? ` (${p.sku})` : ""}` }));
  const pending = orders.filter((o) => o.status === "NEEDS_MAPPING" || o.status === "ERROR");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="ربط سلة وزد" subtitle="الطلبات تنزل لحالها، ومنتجاتها تتربط برمز المنتج (SKU)" />

      <Card>
        <CardTitle action={<Badge tone={on.salla ? "ok" : "neutral"}>{on.salla ? "المفتاح موجود" : "غير مفعّل"}</Badge>}>سلة</CardTitle>
        <ol className="list-decimal space-y-1 ps-5 text-sm text-muted">
          <li>من حساب شريك سلة (Salla Partners) سوّ تطبيق خاص لمتجرك، وفعّل أحداث الطلبات (order.created و order.updated و order.status.updated).</li>
          <li>حط هذا الرابط في خانة Webhook URL، واختر التحقق بـ Signature:</li>
        </ol>
        <CopyField value={`${base}/api/webhooks/salla`} />
        <p className="mt-2 text-sm text-muted">٣) انسخ «المفتاح السري» من سلة، وحطه في Vercel ← Settings ← Environment Variables باسم <code dir="ltr">SALLA_WEBHOOK_SECRET</code>، وبعدها Redeploy.</p>
      </Card>

      <Card>
        <CardTitle action={<Badge tone={on.zid ? "ok" : "neutral"}>{on.zid ? "التوكن موجود" : "غير مفعّل"}</Badge>}>زد</CardTitle>
        <p className="text-sm text-muted">
          ١) اختر كلمة سر طويلة (مثلًا 32 حرف عشوائي) وحطها في Vercel باسم <code dir="ltr">ZID_WEBHOOK_TOKEN</code>، وبعدها Redeploy.
          <br />٢) من زد (لوحة الشركاء ← تطبيقك ← Webhooks) اشترك في أحداث الطلبات (order.create و order.status.update) على هذا الرابط، وبدّل <code dir="ltr">TOKEN</code> بكلمة السر:
        </p>
        <CopyField value={`${base}/api/webhooks/zid?token=TOKEN`} />
      </Card>

      <Card>
        <CardTitle>طلبات تحتاج تدخّل</CardTitle>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">ما فيه شي معلّق.</p>
        ) : (
          <div className="divide-y divide-border">
            {pending.map((o) => (
              <div key={o.id} className="space-y-2 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {STORE_LABEL[o.source]} #{o.reference ?? o.externalId}
                  </span>
                  <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
                </div>
                {o.error && <p className="text-xs text-danger">{o.error}</p>}
                {o.missingSkus.map((sku) => (
                  <MapSkuForm key={sku} sku={sku} products={opts} />
                ))}
                {o.status === "ERROR" && <RetryButton id={o.id} />}
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted">
          منتج جديد؟ أضفه من <Link href="/products/new" className="text-primary">المخزون ← منتج جديد</Link> وحط رمزه، وبعدها اربطه هنا.
        </p>
      </Card>

      <Card>
        <CardTitle>آخر الطلبات من المتاجر</CardTitle>
        {orders.length === 0 ? (
          <Empty>ما وصل شي للحين.</Empty>
        ) : (
          <div className="divide-y divide-border text-sm">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between py-2">
                <div>
                  <div>
                    {STORE_LABEL[o.source]} #{o.reference ?? o.externalId}{" "}
                    {o.orderId && (
                      <Link href={`/orders/${o.orderId}`} className="text-primary">
                        ← الطلب
                      </Link>
                    )}
                  </div>
                  <div className="text-xs text-muted">
                    {dateTime(o.updatedAt)} · حالة المتجر: {o.storeStatus ?? "—"}
                  </div>
                </div>
                <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
