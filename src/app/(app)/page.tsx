import Link from "next/link";
import { prisma } from "@/server/db";
import { dashboardData } from "@/server/services/dashboard";
import { STATUS_LABELS } from "@/domain/status";
import { STATUS_TONE } from "@/lib/labels";
import { money, pct } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, Money, Stat, cn } from "@/components/ui";
import { CapitalChart } from "@/components/capital-chart";

export const dynamic = "force-dynamic";

const heroTone = {
  ok: "border-ok/40 bg-ok-bg",
  info: "border-info/40 bg-info-bg",
  warn: "border-warn/40 bg-warn-bg",
  danger: "border-danger/40 bg-danger-bg",
};

export default async function Dashboard() {
  const d = await dashboardData(prisma);
  const tone = STATUS_TONE[d.status];
  const c = d.cap;

  return (
    <div className="space-y-4">
      {d.alerts.length > 0 && (
        <div className="space-y-2">
          {d.alerts.slice(0, 6).map((a, i) => {
            const body = <Alert key={i} tone={a.tone} title={a.title}>{a.detail}</Alert>;
            return a.href ? <Link key={i} href={a.href} className="block">{body}</Link> : body;
          })}
          {d.alerts.length > 6 && <p className="text-xs text-muted">+ {d.alerts.length - 6} تنبيهات أخرى</p>}
        </div>
      )}

      <Card className={cn("border-2", heroTone[tone])}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">رأس المال الآن</span>
          <Badge tone={tone}>{STATUS_LABELS[d.status]}</Badge>
        </div>
        <div className="num mt-2 text-end text-4xl font-bold">{money(c.capital)}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-muted">هدف اليوم</div>
            <div className="num text-end font-semibold">{money(d.targetToday)}</div>
          </div>
          <div>
            <div className="text-muted">هدف نهاية الأسبوع {d.week}</div>
            <div className="num text-end font-semibold">{money(d.targetWeekEnd)}</div>
          </div>
          <div>
            <div className="text-muted">الفارق</div>
            <div className="num text-end font-semibold">{money(d.gap)}</div>
          </div>
          <div>
            <div className="text-muted">النسبة</div>
            <div className="num text-end font-semibold">{pct(d.gapPct, 2)}</div>
          </div>
        </div>
        {!c.partnerCapital.isZero() && (
          <p className="mt-2 text-xs text-muted">
            بدون رأس مال الشريك (<span className="num">{money(c.partnerCapital)}</span>). صافي حقوق الملكية الكلي <span className="num">{money(c.netEquity)}</span>.
          </p>
        )}
      </Card>

      <Card>
        <CardTitle>المسار: المستهدف مقابل الفعلي</CardTitle>
        <CapitalChart data={d.chart} />
      </Card>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Stat label="السيولة" value={money(c.liquidity)} sub={<>من رأس المال <span className="num">{c.liquidityPct ? `${c.liquidityPct.toFixed(1)}%` : "—"}</span></>} />
        <Stat label="المخزون بالتكلفة" value={money(c.inventory)} sub={<>من رأس المال <span className="num">{c.inventoryPct ? `${c.inventoryPct.toFixed(1)}%` : "—"}</span></>} />
        <Stat label="الذمم المضمونة" value={money(c.receivablesSecured)} sub={c.receivablesOverdue.gt(0) ? <>متأخرة (خارج رأس المال): <span className="num">{money(c.receivablesOverdue)}</span></> : undefined} />
        <Stat label="الالتزامات" value={money(c.liabilities)} sub={<>منها عرابين <span className="num">{money(c.customerDeposits)}</span></>} tone={c.liabilities.gt(0) ? "warn" : undefined} />
        <Stat label="ضريبة محصّلة غير مسددة" value={money(c.vatPayable)} sub="ليست ربحًا" />
        <Stat label="مخصص الزكاة (تقديري)" value={money(c.zakatProvision)} sub="الحساب الرسمي مع المحاسب" />
      </div>

      <Card>
        <CardTitle>العائد الأسبوعي لكل محرك — أسبوع {d.week}</CardTitle>
        <div className="divide-y divide-border">
          {d.engines.map((e) => (
            <div key={e.code} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>{e.name}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-muted">
                  ربح <Money value={e.profit.toString()} /> · رأس مال <Money value={e.capitalUsed.toString()} />
                </span>
                <span className="num w-16 text-end font-semibold">{e.returnPct ? `${e.returnPct.toFixed(1)}%` : "—"}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
