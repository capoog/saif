import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { batchStats, boxCost, boxesAvailable, productMetrics, stockLevels } from "@/server/services/inventory";
import { getSettings } from "@/server/services/settings";
import { date, money } from "@/lib/format";
import { Badge, ButtonLink, Card, CardTitle, Empty, Money, PageHeader, Stat } from "@/components/ui";
import { PRODUCT_STATUS } from "@/lib/labels";
import { ProductEditForm, RecipeForm, StockCountForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id }, include: { engine: true, recipe: true } });
  if (!product) notFound();
  const now = new Date();
  const isBox = product.kind === "BOX";
  const settings = await getSettings(prisma);
  const [levels, metrics, allBatches, cost, materials] = await Promise.all([
    stockLevels(prisma),
    productMetrics(prisma, id, now),
    batchStats(prisma, now, settings.batchWindowDays),
    isBox ? boxCost(prisma, id) : null,
    isBox ? prisma.product.findMany({ where: { kind: "GOODS", deletedAt: null, status: { not: "AVOID" } }, orderBy: [{ category: "asc" }, { name: "asc" }] }) : [],
  ]);
  const level = levels.get(id);
  const batches = allBatches.filter((b) => b.productId === id);
  const sell = product.defaultSellPrice ? Number(product.defaultSellPrice) : null;
  const boxMargin = cost?.complete && sell ? ((sell - Number(cost.total)) / sell) * 100 : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={product.name}
        subtitle={
          <>
            {product.category} · {product.engine.name} · <Badge>{PRODUCT_STATUS[product.status]}</Badge> {isBox && <Badge tone="info">بوكس بمكونات</Badge>}
          </>
        }
        action={!isBox && <ButtonLink href={`/inventory/new?productId=${id}`} size="sm">+ شراء دفعة</ButtonLink>}
      />

      {isBox && cost ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="تكلفة البوكس" value={money(cost.total)} sub={cost.complete ? "من المكونات" : "ناقص تكلفة بعض المكونات"} tone={cost.complete ? undefined : "warn"} />
            <Stat label="سعر البيع" value={sell ? money(sell) : "—"} />
            <Stat label="الهامش" value={boxMargin !== null ? `${boxMargin.toFixed(1)}%` : "—"} sub={cost.complete ? undefined : "لما تكلفة كل المكونات تتعرف"} tone={boxMargin !== null && boxMargin < 40 ? "warn" : undefined} />
            <Stat label="ممكن تجهّز" value={boxesAvailable(levels, product.recipe)} sub="بوكس من المخزون المتاح" />
          </div>
          <Card>
            <CardTitle>المكونات (لكل بوكس)</CardTitle>
            {cost.lines.length > 0 && (
              <div className="mb-3 divide-y divide-border text-sm">
                {cost.lines.map((l) => (
                  <div key={l.id} className="flex justify-between py-2">
                    <span>
                      {l.name} <span className="num text-muted">× {l.quantity.toString()} {l.unit}</span>
                    </span>
                    <span className="text-xs text-muted">
                      {l.lineCost ? <Money value={l.lineCost.toString()} className="text-sm text-fg" /> : "بدون تكلفة"}
                      {l.source === "estimate" && " (تقديري)"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <RecipeForm
              boxId={id}
              lines={product.recipe.map((r) => ({ componentId: r.componentId, quantity: r.quantity.toString() }))}
              materials={materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit, category: m.category }))}
            />
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label={`في المخزون (${product.unit})`} value={level?.onHand.toString() ?? "0"} sub={level?.reserved.gt(0) ? `محجوز ${level.reserved.toString()}` : undefined} />
            <Stat label="قيمة المخزون" value={money(level?.value ?? 0)} />
            <Stat label="الكمية المباعة" value={metrics.qtySold} sub={<>سرعة البيع <span className="num">{metrics.velocityPerDay}</span>/يوم (آخر 14 يوم)</>} />
            <Stat label="الهامش الفعلي" value={metrics.marginPct ? `${metrics.marginPct.toFixed(1)}%` : "—"} sub={<>ربح إجمالي <span className="num">{money(metrics.grossProfit)}</span></>} tone={metrics.marginPct?.lt(30) ? "warn" : undefined} />
          </div>
          <Card>
            <CardTitle>الدفعات (FIFO)</CardTitle>
            {batches.length === 0 ? (
              <Empty>ما فيه دفعات. السعر الفعلي بيتحدد مع أول شراء.</Empty>
            ) : (
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
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
                        <td className="num">{b.quantity.toString()}</td>
                        <td className="num font-semibold">{b.remaining.toString()}</td>
                        <td>
                          <Money value={b.unitCost.toFixed(2)} />
                        </td>
                        <td className="num">
                          {b.remaining.gt(0) ? (
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
        </>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>بيانات المنتج</CardTitle>
          <ProductEditForm
            id={id}
            status={product.status}
            kind={product.kind}
            unit={product.unit}
            price={product.defaultSellPrice?.toString() ?? ""}
            estimate={product.estimatedUnitCost?.toString() ?? ""}
            notes={product.notes ?? ""}
            sku={product.sku ?? ""}
          />
        </Card>
        {!isBox && (
          <Card>
            <CardTitle>جرد سريع</CardTitle>
            <StockCountForm productId={id} onHand={level?.onHand.toString() ?? "0"} unit={product.unit} />
          </Card>
        )}
      </div>

      {(product.buyPriceRange || product.regulatoryNote) && (
        <Card>
          <CardTitle>ملاحظات البحث (تقديرية)</CardTitle>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">شراء</dt>
            <dd>{product.buyPriceRange ?? "—"}</dd>
            <dt className="text-muted">بيع</dt>
            <dd>{product.sellPriceRange ?? "—"}</dd>
            <dt className="text-muted">هامش</dt>
            <dd>{product.grossMarginNote ?? "—"}</dd>
            <dt className="text-muted">الدوران</dt>
            <dd>{product.turnover ?? "—"}</dd>
            <dt className="text-muted">B2B</dt>
            <dd>{product.b2b ?? "—"}</dd>
            <dt className="text-muted">العلامة</dt>
            <dd>{product.brandPotential ?? "—"}</dd>
            <dt className="text-muted">مخاطر/تنظيم</dt>
            <dd>{product.regulatoryNote ?? "—"}</dd>
          </dl>
        </Card>
      )}
    </div>
  );
}
