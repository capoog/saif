import Link from "next/link";
import { notFound } from "next/navigation";
import { CAR_CHECKLIST, type CarChecklist } from "@/domain/rules";
import { prisma } from "@/server/db";
import { accountBalances } from "@/server/services/balances";
import { carTitle, carView } from "@/server/services/cars";
import { effectiveQuoteStatus, QUOTE_STATUS_LABEL, quoteNumberLabel } from "@/server/services/quotes";
import { getSettings } from "@/server/services/settings";
import { CAR_STATUS } from "@/lib/labels";
import { date } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, Money, PageHeader, Stat } from "@/components/ui";
import { BuyCar, CancelCar, CarCost, CarQuote, Checklist, EditCar, SellCar } from "./client";

export const dynamic = "force-dynamic";

export default async function CarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.carDeal.findUnique({ where: { id }, include: { costs: { orderBy: { date: "asc" } }, quotes: { orderBy: { date: "desc" }, include: { customer: { select: { name: true } } } }, buyer: true } });
  if (!c) notFound();
  const [s, balances, customers] = await Promise.all([
    getSettings(prisma),
    accountBalances(prisma),
    prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, name: true, phone: true } }),
  ]);
  const v = carView(c, s);
  const accounts = balances.filter((b) => b.isMoney && !b.isTaxReserve).map((b) => ({ id: b.id, name: b.name, code: b.code, balance: b.balance.toFixed(2) }));
  const open = c.status !== "SOLD" && c.status !== "CANCELLED";
  const checklist = c.checklist as CarChecklist;
  const values = {
    make: c.make, year: c.year, mileage: c.mileage, color: c.color, specs: c.specs, vin: c.vin, source: c.source, ownerName: c.ownerName, ownerPhone: c.ownerPhone,
    marketPrices: (c.marketPrices as string[]) ?? [], askingPrice: c.askingPrice?.toString() ?? "", commissionType: c.commissionType, commissionValue: c.commissionValue?.toString() ?? "", notes: c.notes,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={carTitle(c)}
        subtitle={
          <>
            {c.mileage != null && <span className="num">{c.mileage.toLocaleString("en-US")} كم</span>}
            {c.color && ` · ${c.color}`} · {c.type === "BROKERAGE" ? `وساطة${c.ownerName ? ` — ${c.ownerName}` : ""}` : "شراء وبيع"}
          </>
        }
        action={<Badge tone={c.status === "SOLD" ? "ok" : c.status === "CANCELLED" ? "danger" : "info"}>{CAR_STATUS[c.status]}</Badge>}
      />
      {c.specs && <p className="text-sm text-muted">{c.specs}</p>}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="السعر المطلوب" value={c.askingPrice ? <Money value={c.askingPrice.toString()} /> : "—"} />
        <Stat label="متوسط السوق" value={c.marketAvg ? <Money value={c.marketAvg.toString()} /> : "—"} sub={v.pctOfMarket ? `${c.type === "PURCHASE" && c.purchasePrice ? "الشراء" : "المطلوب"} ${v.pctOfMarket.toFixed(0)}% منه` : `${(c.marketPrices as string[]).length} إعلان`} />
        {c.type === "PURCHASE" ? (
          <Stat label="التكلفة" value={v.cost ? <Money value={v.cost.toString()} /> : "—"} sub={v.holdingDays !== null ? `${v.holdingDays} يوم عندك` : undefined} tone={v.signal?.level === "SELL_NOW" ? "danger" : v.signal?.level === "MARKDOWN" ? "warn" : undefined} />
        ) : (
          <Stat label="العمولة المتوقعة" value={v.expectedCommission ? <Money value={v.expectedCommission.toString()} /> : "—"} sub={c.commissionType === "PERCENT" ? `${c.commissionValue}% من البيع` : "مبلغ ثابت"} />
        )}
        <Stat label={c.status === "SOLD" ? "صافي الربح" : "الربح المتوقع"} value={v.profit ? <Money value={v.profit.toString()} /> : c.type === "PURCHASE" && v.cost && c.askingPrice ? <Money value={(Number(c.askingPrice) - Number(v.cost)).toFixed(2)} /> : "—"} sub={v.roiPct ? `عائد ${v.roiPct.toFixed(1)}%` : undefined} tone={v.profit?.lt(0) ? "danger" : undefined} />
      </div>

      {v.signal?.level === "SELL_NOW" && <Alert tone="danger" title="يوم 21: بع فورًا">أقل سعر مقبول <Money value={v.signal.minPrice.toString()} /> (خسارة ≤ {s.carMaxLossPct}%).</Alert>}
      {v.signal?.level === "MARKDOWN" && <Alert tone="warn" title="يوم 14: خفّض لنقطة التعادل">نقطة التعادل <Money value={v.signal.minPrice.toString()} />.</Alert>}

      {open && (
        <Card>
          <CardTitle>عرض سعر للسيارة</CardTitle>
          <CarQuote id={c.id} price={c.askingPrice?.toString() ?? ""} customers={customers} />
        </Card>
      )}

      {c.quotes.length > 0 && (
        <Card>
          <CardTitle>عروض الأسعار ({c.quotes.length})</CardTitle>
          {c.quotes.map((q) => (
            <Link key={q.id} href={`/quotes/${q.id}`} className="flex justify-between py-2 text-sm">
              <span>
                <span className="num">{quoteNumberLabel(q)}</span> · {q.customer.name}
              </span>
              <span className="flex items-center gap-2">
                <Money value={q.total.toString()} />
                <Badge>{QUOTE_STATUS_LABEL[effectiveQuoteStatus(q)]}</Badge>
              </span>
            </Link>
          ))}
        </Card>
      )}

      {c.type === "PURCHASE" && c.status === "EVALUATING" && (
        <Card>
          <CardTitle>قبل الشراء</CardTitle>
          <Checklist id={c.id} items={CAR_CHECKLIST.map((x) => ({ key: x.key, label: x.label, done: !!checklist[x.key] }))} />
          <div className="my-4 border-t border-border" />
          <BuyCar id={c.id} accounts={accounts} limitNote={c.marketAvg ? `حد الشراء ${s.carMaxMarketPct}% من السوق = ${((Number(c.marketAvg) * s.carMaxMarketPct) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "اكتب أسعار السوق أول"} />
        </Card>
      )}

      {c.type === "PURCHASE" && (c.status === "OWNED" || c.costs.length > 0) && (
        <Card>
          <CardTitle>التكلفة</CardTitle>
          <div className="divide-y divide-border text-sm">
            <div className="flex justify-between py-2">
              <span>الشراء {c.purchasedAt && `· ${date(c.purchasedAt)}`}</span>
              <Money value={c.purchasePrice?.toString() ?? "0"} />
            </div>
            {c.costs.map((x) => (
              <div key={x.id} className="flex justify-between py-2">
                <span>
                  {x.description} · {date(x.date)}
                </span>
                <Money value={x.amount.toString()} />
              </div>
            ))}
          </div>
          {c.status === "OWNED" && (
            <div className="mt-3">
              <CarCost id={c.id} accounts={accounts} />
            </div>
          )}
        </Card>
      )}

      {(c.status === "OWNED" || c.status === "LISTED") && (
        <Card>
          <CardTitle>{c.type === "BROKERAGE" ? "انباعت؟ سجّل عمولتك" : "بيع السيارة"}</CardTitle>
          <SellCar id={c.id} price={c.askingPrice?.toString() ?? ""} accounts={accounts} customers={customers} brokerage={c.type === "BROKERAGE"} />
        </Card>
      )}

      {c.status === "SOLD" && (
        <Alert tone="ok" title={`انباعت ${c.soldAt ? date(c.soldAt) : ""} بـ ${Number(c.salePrice).toLocaleString("en-US")}`}>
          {c.buyer && <>المشتري: <Link href={`/customers/${c.buyer.id}`} className="underline">{c.buyer.name}</Link> · </>}
          {c.type === "BROKERAGE" ? <>العمولة <Money value={c.commission?.toString() ?? "0"} /></> : v.profit && <>الربح <Money value={v.profit.toString()} /></>}
        </Alert>
      )}

      {open && (
        <Card>
          <CardTitle>البيانات</CardTitle>
          <EditCar id={c.id} type={c.type} values={values} />
        </Card>
      )}
      {(c.status === "EVALUATING" || c.status === "LISTED") && <CancelCar id={c.id} />}
    </div>
  );
}
