import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getCapital } from "@/server/services/balances";
import { BUSINESS_KINDS, QUICK_SALE_KINDS, businessOverview } from "@/server/services/businesses";
import { stockLevels } from "@/server/services/inventory";
import { PRODUCT_STATUS } from "@/lib/labels";
import { Alert, Badge, ButtonLink, Card, CardTitle, Money, PageHeader, Stat } from "@/components/ui";
import { EditBusinessForm, ToggleBusiness } from "../client";

export const dynamic = "force-dynamic";

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await prisma.engine.findUnique({ where: { id } });
  if (!e) notFound();
  const cap = await getCapital(prisma);
  const [row] = (await businessOverview(prisma, cap.capital)).filter((r) => r.id === id);
  const products = await prisma.product.findMany({ where: { engineId: id, deletedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
  const levels = await stockLevels(prisma, products.map((p) => p.id));
  const kind = BUSINESS_KINDS[e.kind] ?? BUSINESS_KINDS.OTHER;
  const food = ["RESTAURANT", "CAFE", "FOOD_TRUCK"].includes(e.kind);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={e.name}
        subtitle={kind.label}
        action={
          QUICK_SALE_KINDS.includes(e.kind) && e.active ? (
            <ButtonLink href={`/sell?b=${e.id}`} size="sm">
              بيع سريع
            </ButtonLink>
          ) : undefined
        }
      />
      {row.overLimit && <Alert tone="danger">النشاط يستخدم {row.capitalPct!.toFixed(0)}% من رأس المال، فوق الحد ({row.maxCapitalPct!.toFixed(0)}%).</Alert>}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="مبيعات الشهر" value={<Money value={row.monthRevenue.toString()} />} />
        <Stat label="ربح الشهر" value={<Money value={row.monthProfit.toString()} />} tone={row.monthProfit.lt(0) ? "danger" : undefined} />
        <Stat label="رأس المال المستخدم" value={<Money value={row.capitalUsed.toString()} />} sub={row.capitalPct ? `${row.capitalPct.toFixed(0)}%` : undefined} />
      </div>

      <Card>
        <CardTitle action={<ButtonLink href={`/products/new?engine=${e.id}`} size="sm" variant="secondary">+ منتج</ButtonLink>}>المنتجات</CardTitle>
        {food && (
          <p className="mb-3 rounded-xl bg-subtle p-3 text-xs text-muted">
            <b>كيف تبدأ:</b> ١) أضف المواد الخام (بن، حليب، لحم…) كنوع «منتج / مادة» ووحدتها (كجم، لتر، حبة). ٢) سجّل شراها من «شراء دفعة». ٣) أضف الأصناف اللي تبيعها كنوع «صنف بمكونات» وحط سعرها، وحدد مكوناتها من صفحة الصنف. بعدها كل بيع يخصم المكونات ويحسب التكلفة الحقيقية.
          </p>
        )}
        {products.length === 0 ? (
          <p className="text-sm text-muted">ما فيه منتجات للحين.</p>
        ) : (
          <div className="divide-y divide-border">
            {products.map((p) => (
              <Link key={p.id} href={`/products/${p.id}`} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted">
                    {p.kind === "BOX" ? "صنف بمكونات" : p.kind === "SERVICE" ? "خدمة" : `مخزون ${levels.get(p.id)?.onHand.toString() ?? "0"} ${p.unit}`} · {PRODUCT_STATUS[p.status]}
                  </div>
                </div>
                {p.defaultSellPrice ? <Money value={p.defaultSellPrice.toString()} /> : <Badge tone="warn">بدون سعر</Badge>}
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle action={<ToggleBusiness id={e.id} active={e.active} />}>بيانات النشاط</CardTitle>
        <EditBusinessForm
          id={e.id}
          kinds={Object.entries(BUSINESS_KINDS).filter(([k]) => k !== "CORE").map(([k, v]) => ({ k, label: v.label, hint: v.hint }))}
          b={{ name: e.name, kind: e.kind, maxCapitalPct: e.maxCapitalPct?.toString() ?? "", notes: e.notes ?? "" }}
        />
        {!e.active && <p className="mt-2 text-xs text-muted">النشاط موقوف: ما يطلع في النماذج الجديدة، وبياناته وتقاريره باقية.</p>}
      </Card>
    </div>
  );
}
