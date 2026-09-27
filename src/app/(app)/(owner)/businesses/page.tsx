import Link from "next/link";
import { prisma } from "@/server/db";
import { getCapital } from "@/server/services/balances";
import { BUSINESS_KINDS, businessOverview } from "@/server/services/businesses";
import { Badge, Card, CardTitle, Money, PageHeader } from "@/components/ui";
import { NewBusinessForm } from "./client";

export const dynamic = "force-dynamic";

export default async function BusinessesPage() {
  const cap = await getCapital(prisma);
  const rows = await businessOverview(prisma, cap.capital);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="الأنشطة" subtitle="كل نشاط له منتجاته ومبيعاته وربحه، ويدخل في رأس المال والهدف" />
      <div className="space-y-2">
        {rows.map((r) => (
          <Link key={r.id} href={`/businesses/${r.id}`} className="block">
            <Card className={r.active ? "p-3 hover:border-primary/50" : "p-3 opacity-60"}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-muted">
                    {BUSINESS_KINDS[r.kind]?.label ?? r.kind} · <span className="num">{r.products}</span> منتج
                  </div>
                </div>
                <div className="text-end text-sm">
                  <div>
                    ربح الشهر <Money value={r.monthProfit.toString()} className={r.monthProfit.lt(0) ? "font-bold text-danger" : "font-bold"} />
                  </div>
                  <div className="text-xs text-muted">
                    مبيعات <Money value={r.monthRevenue.toString()} />
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {!r.active && <Badge>موقوف</Badge>}
                {r.capitalPct && r.capitalUsed.gt(0) && (
                  <Badge tone={r.overLimit ? "danger" : "neutral"}>
                    يستخدم <span className="num">{r.capitalPct.toFixed(0)}%</span> من رأس المال{r.maxCapitalPct && <> (الحد {r.maxCapitalPct.toFixed(0)}%)</>}
                  </Badge>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>
      <Card>
        <CardTitle>+ أضف نشاط جديد</CardTitle>
        <NewBusinessForm kinds={Object.entries(BUSINESS_KINDS).filter(([k]) => k !== "CORE").map(([k, v]) => ({ k, label: v.label, hint: v.hint }))} />
      </Card>
    </div>
  );
}
