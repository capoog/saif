import Link from "next/link";
import { prisma } from "@/server/db";
import { materialNeeds, ramadanCounter } from "@/server/services/b2b";
import { sum } from "@/domain/money";
import { date } from "@/lib/format";
import { Badge, Card, CardTitle, Empty, Money, PageHeader, cn } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function B2BPage() {
  const [r, contracts, needs] = await Promise.all([
    ramadanCounter(prisma),
    prisma.b2BContract.findMany({
      orderBy: { signedAt: "desc" },
      include: { customer: { select: { name: true } }, orders: { include: { payments: { where: { deletedAt: null }, select: { amount: true } } } } },
    }),
    materialNeeds(prisma),
  ]);
  const pct = Math.min((r.signed / r.target) * 100, 100);
  return (
    <div className="space-y-4">
      <PageHeader title="عقود B2B ورمضان" subtitle="العقد بيتعمل من عرض سعر مقبول" />

      <Card className="border-2 border-primary/40">
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">المفصل الحاسم: عقود رمضان بعربون</span>
          <span className="text-xs text-muted">
            قبل {date(new Date(`${r.deadline}T12:00:00Z`))} · باقي <span className="num">{r.daysLeft}</span> يوم
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="num text-4xl font-bold">{r.signed}</span>
          <span className="num text-lg text-muted">/ {r.target}</span>
          {r.pendingDeposit > 0 && <Badge tone="warn">{r.pendingDeposit} مستني عربون</Badge>}
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-subtle">
          <div className={cn("h-full rounded-full", pct >= 100 ? "bg-ok" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-xs text-muted">
          قيمة العقود الموقعة <Money value={r.value.toString()} />
        </div>
      </Card>

      <Card>
        <CardTitle>العقود</CardTitle>
        {contracts.length === 0 ? (
          <Empty>
            مفيش عقود. ابدأ من <Link href="/quotes/new" className="text-primary">عرض سعر</Link>.
          </Empty>
        ) : (
          <div className="divide-y divide-border">
            {contracts.map((k) => {
              const live = k.orders.filter((o) => o.status !== "CANCELLED");
              const paid = sum(live.flatMap((o) => o.payments.map((p) => p.amount)));
              const delivered = live.filter((o) => o.status === "DELIVERED").length;
              return (
                <Link key={k.id} href={`/b2b/${k.id}`} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <div className="font-medium">{k.customer.name}</div>
                    <div className="text-xs text-muted">
                      عقد <span className="num">#{k.number}</span> · {date(k.signedAt)} · اتسلم <span className="num">{delivered}/{live.length}</span>
                    </div>
                  </div>
                  <div className="text-end">
                    <Money value={k.total.toString()} className="font-semibold" />
                    <div className="text-xs text-muted">
                      محصّل <Money value={paid.toString()} />
                    </div>
                    {k.status !== "ACTIVE" && <Badge tone={k.status === "COMPLETED" ? "ok" : "danger"}>{k.status === "COMPLETED" ? "مكتمل" : "ملغي"}</Badge>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>احتياج المواد للطلبات المفتوحة</CardTitle>
        {needs.length === 0 ? (
          <p className="text-sm text-muted">مفيش طلبات مفتوحة.</p>
        ) : (
          <div className="divide-y divide-border text-sm">
            {needs.map((n) => (
              <div key={n.productId} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <Link href={`/products/${n.productId}`} className="font-medium">{n.name}</Link>
                  <div className="text-xs text-muted">
                    مطلوب <span className="num">{n.required.toString()}</span> · عندك <span className="num">{n.onHand.toString()}</span> {n.unit}
                  </div>
                </div>
                {n.shortfall.gt(0) ? <Badge tone="danger">ناقص <span className="num mx-1">{n.shortfall.toString()}</span></Badge> : <Badge tone="ok">كفاية</Badge>}
              </div>
            ))}
          </div>
        )}
        {needs.some((n) => n.shortfall.gt(0)) && (
          <Link href="/suppliers" className="mt-3 inline-block text-sm text-primary">
            اعمل أمر شراء للناقص ←
          </Link>
        )}
      </Card>
    </div>
  );
}
