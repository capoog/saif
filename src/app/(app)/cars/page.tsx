import Link from "next/link";
import type { CarDealStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { carTitle, carView } from "@/server/services/cars";
import { getSettings } from "@/server/services/settings";
import { Badge, ButtonLink, Card, Empty, Money, PageHeader, cn } from "@/components/ui";
import { CAR_STATUS } from "@/lib/labels";

export const dynamic = "force-dynamic";

const FILTERS = [
  { v: "open", l: "الحالية" },
  { v: "sold", l: "المباعة" },
  { v: "all", l: "الكل" },
];

export default async function CarsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f = "open" } = await searchParams;
  const where = f === "open" ? { status: { in: ["EVALUATING", "LISTED", "OWNED"] as CarDealStatus[] } } : f === "sold" ? { status: "SOLD" as CarDealStatus } : {};
  const [cars, s] = await Promise.all([prisma.carDeal.findMany({ where, include: { costs: true }, orderBy: { updatedAt: "desc" } }), getSettings(prisma)]);
  const soldProfit = cars.filter((c) => c.status === "SOLD").reduce((sum, c) => sum + Number(carView(c, s).profit ?? 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="السيارات"
        subtitle={f === "sold" && cars.length ? <>صافي ربح المعروض: <Money value={soldProfit} className="font-semibold text-fg" /></> : "وساطة، وشراء وبيع من رأس مال 50 ألف"}
        action={<ButtonLink href="/cars/new" size="sm">+ سيارة</ButtonLink>}
      />
      <div className="flex gap-2">
        {FILTERS.map((x) => (
          <Link key={x.v} href={`/cars?f=${x.v}`} className={cn("rounded-full border px-3 py-1.5 text-sm", f === x.v ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border")}>
            {x.l}
          </Link>
        ))}
      </div>
      {cars.length === 0 ? (
        <Empty>ما فيه سيارات هنا.</Empty>
      ) : (
        cars.map((c) => {
          const v = carView(c, s);
          return (
            <Link key={c.id} href={`/cars/${c.id}`} className="block">
              <Card className="mb-2 p-3 hover:border-primary/50">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{carTitle(c)}</div>
                    <div className="text-xs text-muted">
                      {c.mileage != null && <span className="num">{c.mileage.toLocaleString("en-US")} كم</span>}
                      {c.color && ` · ${c.color}`}
                      {c.type === "BROKERAGE" ? " · وساطة" : " · شراء وبيع"}
                    </div>
                  </div>
                  <div className="text-end">
                    {c.askingPrice && <Money value={c.askingPrice.toString()} className="font-bold" />}
                    {v.pctOfMarket && <div className="text-xs text-muted"><span className="num">{v.pctOfMarket.toFixed(0)}%</span> من السوق</div>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={c.status === "SOLD" ? "ok" : c.status === "CANCELLED" ? "danger" : "info"}>{CAR_STATUS[c.status]}</Badge>
                  {v.holdingDays !== null && <Badge tone={v.signal?.level === "SELL_NOW" ? "danger" : v.signal?.level === "MARKDOWN" ? "warn" : "neutral"}>{v.holdingDays} يوم عندك</Badge>}
                  {v.profit && <Badge tone={v.profit.gte(0) ? "ok" : "danger"}>ربح <Money value={v.profit.toString()} className="mx-1" /></Badge>}
                  {c.type === "BROKERAGE" && c.status === "LISTED" && v.expectedCommission && <Badge>عمولة متوقعة <Money value={v.expectedCommission.toString()} className="mx-1" /></Badge>}
                </div>
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
