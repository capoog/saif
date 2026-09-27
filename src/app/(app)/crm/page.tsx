import Link from "next/link";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { crmToday, DEAL_STAGES } from "@/server/services/crm";
import { getSettings } from "@/server/services/settings";
import { date } from "@/lib/format";
import { Badge, ButtonLink, Card, CardTitle, Empty, Money, PageHeader, cn } from "@/components/ui";
import { DealStageForm, FollowUpForm, LogButtons } from "./client";

export const dynamic = "force-dynamic";

function Meter({ value, min, max, label, children }: { value: number; min: number; max: number; label: string; children?: React.ReactNode }) {
  const pct = Math.min((value / max) * 100, 100);
  const tone = value >= min ? "bg-ok" : value >= min / 2 ? "bg-warn" : "bg-danger";
  return (
    <Card className="p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted">
          الهدف <span className="num">{min}–{max}</span>
        </span>
      </div>
      <div className="num mt-1 text-end text-3xl font-bold">{value}</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-subtle">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      {children && <div className="mt-3">{children}</div>}
    </Card>
  );
}

export default async function CrmPage() {
  const user = await requireUser(["owner", "sales"]);
  const [d, s] = await Promise.all([crmToday(prisma, new Date(), user.role === "owner" ? null : user.id), getSettings(prisma)]);
  const byStage = new Map(DEAL_STAGES.map((st) => [st.stage, d.deals.filter((x) => x.stage === st.stage)]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="العملاء والصفقات"
        action={
          <div className="flex gap-2">
            <ButtonLink href="/customers" size="sm" variant="secondary">العملاء</ButtonLink>
            <ButtonLink href="/crm/deals/new" size="sm">+ صفقة</ButtonLink>
          </div>
        }
      />

      <div id="log" className="grid gap-2 md:grid-cols-2">
        <Meter value={d.activitiesToday} min={s.dailyOutreachMin} max={s.dailyOutreachMax} label="تواصلات اليوم">
          <LogButtons />
        </Meter>
        <Meter value={d.quotesToday} min={s.dailyQuotesMin} max={s.dailyQuotesMax} label="عروض أسعار اليوم">
          <ButtonLink href="/quotes/new" size="sm" variant="secondary" className="w-full">+ عرض سعر</ButtonLink>
        </Meter>
      </div>

      <Card>
        <CardTitle>متابعات اليوم ({d.followUps.length})</CardTitle>
        {d.followUps.length === 0 ? (
          <p className="text-sm text-muted">ما فيه متابعات مستحقة 👌</p>
        ) : (
          <div className="divide-y divide-border">
            {d.followUps.map((f) => (
              <div key={f.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/customers/${f.customer.id}`} className="font-medium">{f.customer.name}</Link>
                    <div className="text-xs text-muted">{f.title}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {f.overdue && <Badge tone="danger">متأخرة · {date(f.nextFollowUpAt)}</Badge>}
                    {f.customer.phone && (
                      <>
                        <a href={`tel:${f.customer.phone}`} className="rounded-lg bg-subtle px-2 py-1 text-xs">اتصال</a>
                        <a href={`https://wa.me/966${f.customer.phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer" className="rounded-lg bg-subtle px-2 py-1 text-xs">واتساب</a>
                      </>
                    )}
                  </div>
                </div>
                <FollowUpForm id={f.id} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <div>
        <h2 className="mb-2 font-semibold">لوحة الصفقات</h2>
        {d.deals.length === 0 ? (
          <Empty>
            ما فيه صفقات للحين. ابدأ بـ <Link href="/crm/deals/new" className="text-primary">+ صفقة</Link> أو <Link href="/customers/import" className="text-primary">استورد عملاء</Link>.
          </Empty>
        ) : (
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
            {DEAL_STAGES.map(({ stage, label }) => {
              const list = byStage.get(stage) ?? [];
              const total = list.reduce((sum, x) => sum + Number(x.value ?? 0), 0);
              return (
                <div key={stage} className="w-64 shrink-0 snap-start">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-semibold">{label}</span>
                    <span className="text-xs text-muted">
                      <span className="num">{list.length}</span>
                      {total > 0 && <> · <Money value={total} /></>}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {list.map((x) => (
                      <Card key={x.id} className="p-3">
                        <Link href={`/customers/${x.customer.id}`} className="block font-medium">{x.customer.name}</Link>
                        <div className="text-xs text-muted">{x.title}</div>
                        <div className="mt-1 flex items-center justify-between text-xs">
                          {x.value ? <Money value={x.value.toString()} className="font-semibold" /> : <span />}
                          {x.nextFollowUpAt && <span className="text-muted">متابعة {date(x.nextFollowUpAt)}</span>}
                        </div>
                        {x.lostReason && <div className="mt-1 text-xs text-danger">{x.lostReason}</div>}
                        <DealStageForm id={x.id} stage={x.stage} />
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
