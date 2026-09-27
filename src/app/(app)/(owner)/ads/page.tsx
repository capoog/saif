import { prisma } from "@/server/db";
import { AD_CHANNELS, adsOverview } from "@/server/services/ads";
import { accountBalances } from "@/server/services/balances";
import { getSettings } from "@/server/services/settings";
import { Alert, Badge, Card, CardTitle, Empty, Money, PageHeader, Stat } from "@/components/ui";
import { NewCampaign, SpendForm, ToggleCampaign } from "./client";

export const dynamic = "force-dynamic";

export default async function AdsPage() {
  const [o, balances, products, engines, s] = await Promise.all([
    adsOverview(prisma),
    accountBalances(prisma),
    prisma.product.findMany({ where: { deletedAt: null, status: { notIn: ["AVOID", "LATER"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.engine.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    getSettings(prisma),
  ]);
  const accounts = balances.filter((b) => b.isMoney && !b.isTaxReserve).map((b) => ({ id: b.id, name: b.name, code: b.code }));
  return (
    <div className="space-y-4">
      <PageHeader title="الإعلانات" subtitle={`الإنفاق يتسجل مصروف تسويق. القاعدة: بعد ${s.adStopMinSpend} ريال على منتج، لو تكلفة الطلب > ${s.adStopCpaMarginPct}% من ربحه → أوقف.`} />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="الإنفاق" value={<Money value={o.total.spend.toString()} />} />
        <Stat label="تكلفة الطلب CPA" value={o.total.cpa ? <Money value={o.total.cpa.toString()} /> : "—"} sub={`${o.total.orders} طلب`} />
        <Stat label="العائد ROAS" value={o.total.roas ? `${o.total.roas.toFixed(2)}×` : "—"} tone={o.total.roas ? (o.total.roas.gte(3) ? "ok" : o.total.roas.lt(1.5) ? "danger" : undefined) : undefined} />
      </div>

      {o.products.filter((p) => p.signal.stop).map((p) => (
        <Alert key={p.productId} tone="danger" title={`أوقف إعلانات: ${p.name}`}>{p.signal.reason}</Alert>
      ))}

      {o.products.length > 0 && (
        <Card>
          <CardTitle>حسب المنتج</CardTitle>
          <div className="divide-y divide-border text-sm">
            {o.products.map((p) => (
              <div key={p.productId} className="flex items-center justify-between py-2">
                <span>{p.name}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <Money value={p.perf.spend.toString()} /> · CPA {p.perf.cpa ? <Money value={p.perf.cpa.toString()} /> : "—"} · ربح/طلب {p.grossProfitPerOrder ? <Money value={p.grossProfitPerOrder.toString()} /> : "—"}
                  <Badge tone={p.perf.roas?.gte(3) ? "ok" : "neutral"}>{p.perf.roas ? `${p.perf.roas.toFixed(1)}×` : "—"}</Badge>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-2">
        <h2 className="font-semibold">الحملات</h2>
        {o.rows.length === 0 ? (
          <Empty>ما فيه حملات. أضف أول حملة تحت.</Empty>
        ) : (
          o.rows.map((c) => (
            <Card key={c.id} className={c.active ? "" : "opacity-60"}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted">
                    {c.channel}
                    {c.productName && ` · ${c.productName}`}
                  </div>
                </div>
                <ToggleCampaign id={c.id} active={c.active} />
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                <div>
                  <div className="text-muted">إنفاق</div>
                  <Money value={c.perf.spend.toString()} className="font-semibold" />
                </div>
                <div>
                  <div className="text-muted">طلبات</div>
                  <span className="num font-semibold">{c.perf.orders}</span>
                </div>
                <div>
                  <div className="text-muted">CPA</div>
                  {c.perf.cpa ? <Money value={c.perf.cpa.toString()} className="font-semibold" /> : "—"}
                </div>
                <div>
                  <div className="text-muted">ROAS</div>
                  <span className="num font-semibold">{c.perf.roas ? `${c.perf.roas.toFixed(2)}×` : "—"}</span>
                </div>
              </div>
              {c.active && <SpendForm campaignId={c.id} accounts={accounts} />}
            </Card>
          ))
        )}
      </div>

      <Card>
        <CardTitle>حملة جديدة</CardTitle>
        <NewCampaign channels={[...AD_CHANNELS]} products={products} engines={engines.map((e) => ({ id: e.id, name: e.name }))} />
      </Card>
    </div>
  );
}
