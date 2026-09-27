import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { batchStats, productMetrics, stockLevels } from "@/server/services/inventory";
import { getSettings } from "@/server/services/settings";
import { date, money } from "@/lib/format";
import { Badge, ButtonLink, Card, CardTitle, Empty, Money, PageHeader, Stat } from "@/components/ui";
import { PRODUCT_STATUS } from "@/lib/labels";
import { ProductEditForm, StockCountForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id }, include: { engine: true } });
  if (!product) notFound();
  const now = new Date();
  const settings = await getSettings(prisma);
  const [level, metrics, allBatches] = await Promise.all([
    stockLevels(prisma, [id]).then((m) => m.get(id)),
    productMetrics(prisma, id, now),
    batchStats(prisma, now, settings.batchWindowDays),
  ]);
  const batches = allBatches.filter((b) => b.productId === id);

  return (
    <div className="space-y-4">
      <PageHeader
        title={product.name}
        subtitle={<>{product.category} · {product.engine.name} · <Badge>{PRODUCT_STATUS[product.status]}</Badge></>}
        action={<ButtonLink href={`/inventory/new?productId=${id}`} size="sm">+ شراء دفعة</ButtonLink>}
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="في المخزون" value={level?.onHand ?? 0} sub={level?.reserved ? `محجوز ${level.reserved}` : undefined} />
        <Stat label="قيمة المخزون" value={money(level?.value ?? 0)} />
        <Stat label="الكمية المباعة" value={metrics.qtySold} sub={<>سرعة البيع <span className="num">{metrics.velocityPerDay}</span>/يوم (آخر 14 يوم)</>} />
        <Stat label="الهامش الفعلي" value={metrics.marginPct ? `${metrics.marginPct.toFixed(1)}%` : "—"} sub={<>ربح إجمالي <span className="num">{money(metrics.grossProfit)}</span></>} tone={metrics.marginPct?.lt(30) ? "warn" : undefined} />
      </div>
      <p className="text-xs text-muted">تكلفة الطلب من الإعلانات (CPA) هتظهر هنا مع وحدة الإعلانات في المرحلة 2.</p>

      <Card>
        <CardTitle>الدفعات (FIFO)</CardTitle>
        {batches.length === 0 ? (
          <Empty>مفيش دفعات. السعر الفعلي بيتحدد مع أول شراء.</Empty>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-xs text-muted">
                <tr className="text-start">
                  <th className="py-2 text-start font-medium">التاريخ</th>
                  <th className="text-start font-medium">الكمية</th>
                  <th className="text-start font-medium">المتبقي</th>
                  <th className="text-start font-medium">تكلفة الوحدة</th>
                  <th className="text-start font-medium">العمر</th>
                  <th className="text-start font-medium">البيع بعد {settings.batchWindowDays} يوم</th>
                  <th className="text-start font-medium">المورد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2">{date(b.receivedAt)}</td>
                    <td className="num">{b.quantity}</td>
                    <td className="num font-semibold">{b.remaining}</td>
                    <td><Money value={b.unitCost.toFixed(2)} /></td>
                    <td className="num">
                      {b.remaining > 0 ? (
                        <Badge tone={b.ageDays >= settings.inventoryAgeLiquidateDays ? "danger" : b.ageDays >= settings.inventoryAgeMarkdownDays ? "warn" : "neutral"}>{b.ageDays} يوم</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num">
                      {b.sellThroughWindowPct === null ? (
                        <span className="text-muted">{b.sellThroughPct}% حتى الآن</span>
                      ) : (
                        <Badge tone={b.sellThroughWindowPct < settings.batchSlowPct ? "danger" : b.sellThroughWindowPct >= settings.batchFastPct ? "ok" : "neutral"}>{b.sellThroughWindowPct}%</Badge>
                      )}
                    </td>
                    <td className="text-xs text-muted">{b.supplierName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>الحالة والسعر</CardTitle>
          <ProductEditForm id={id} status={product.status} price={product.defaultSellPrice?.toString() ?? ""} notes={product.notes ?? ""} />
        </Card>
        <Card>
          <CardTitle>جرد سريع</CardTitle>
          <StockCountForm productId={id} onHand={level?.onHand ?? 0} />
        </Card>
      </div>

      {(product.buyPriceRange || product.regulatoryNote) && (
        <Card>
          <CardTitle>ملاحظات البحث (تقديرية)</CardTitle>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">شراء</dt><dd>{product.buyPriceRange ?? "—"}</dd>
            <dt className="text-muted">بيع</dt><dd>{product.sellPriceRange ?? "—"}</dd>
            <dt className="text-muted">هامش</dt><dd>{product.grossMarginNote ?? "—"}</dd>
            <dt className="text-muted">الدوران</dt><dd>{product.turnover ?? "—"}</dd>
            <dt className="text-muted">B2B</dt><dd>{product.b2b ?? "—"}</dd>
            <dt className="text-muted">العلامة</dt><dd>{product.brandPotential ?? "—"}</dd>
            <dt className="text-muted">مخاطر/تنظيم</dt><dd>{product.regulatoryNote ?? "—"}</dd>
          </dl>
        </Card>
      )}
    </div>
  );
}
