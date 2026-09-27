import Link from "next/link";
import { prisma } from "@/server/db";
import { agencyOverview, clientMargins, freelancerBalances, monthKeyOf, prevMonthKey } from "@/server/services/agency";
import { accountBalances } from "@/server/services/balances";
import { getSettings } from "@/server/services/settings";
import { date } from "@/lib/format";
import { Badge, Card, CardTitle, Empty, Money, PageHeader, Stat, cn } from "@/components/ui";
import { ChargeButton, FreelancerForm, NewSubscription, NewTask, OwnerTaskButtons, PayFreelancer, SubscriptionControls } from "./client";

export const dynamic = "force-dynamic";

const TABS = [
  { v: "overview", l: "الملخص" },
  { v: "subs", l: "الاشتراكات" },
  { v: "tasks", l: "المهام" },
  { v: "freelancers", l: "المستقلين" },
];
const TASK_STATUS: Record<string, string> = { TODO: "جديدة", IN_PROGRESS: "شغّالة", DELIVERED: "مسلّمة — تنتظر اعتمادك", APPROVED: "معتمدة", CANCELLED: "ملغية" };

export default async function AgencyPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "overview" } = await searchParams;
  const now = new Date();
  const [o, s, subs, tasks, freelancers, fBal, customers, balances] = await Promise.all([
    agencyOverview(prisma, now),
    getSettings(prisma),
    prisma.subscription.findMany({ orderBy: [{ status: "asc" }, { nextBillingDate: "asc" }], include: { customer: { select: { id: true, name: true } } } }),
    prisma.agencyTask.findMany({ where: { status: { not: "CANCELLED" } }, orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 100, include: { customer: { select: { name: true } }, freelancer: { select: { name: true } } } }),
    prisma.freelancer.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    freelancerBalances(prisma),
    prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    accountBalances(prisma),
  ]);
  const accounts = balances.filter((b) => b.isMoney && !b.isTaxReserve).map((b) => ({ id: b.id, name: b.name, code: b.code }));
  const [thisMonth, lastMonth] = await Promise.all([clientMargins(prisma, monthKeyOf(now), s), clientMargins(prisma, prevMonthKey(now), s)]);
  const endToday = new Date(now.getTime() + 86400000);
  const due = subs.filter((x) => x.status === "ACTIVE" && x.nextBillingDate <= endToday);
  const pct = Math.min((o.clients / o.next.count) * 100, 100);

  return (
    <div className="space-y-4">
      <PageHeader title="الوكالة الرقمية" subtitle="اشتراكات شهرية، والتنفيذ عبر مستقلين" />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => (
          <Link key={t.v} href={`/agency?tab=${t.v}`} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", tab === t.v ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border")}>
            {t.l}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="الدخل الشهري المتكرر (MRR)" value={<Money value={o.mrr.toString()} />} />
            <Stat label={`العملاء مقابل هدف اليوم ${o.next.day}`} value={`${o.clients} / ${o.next.count}`} sub={`باقي ${o.daysToMilestone} يوم`} tone={o.clients >= o.next.count ? "ok" : "warn"} />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-subtle">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <Card>
            <CardTitle>اشتراكات مستحقة التسجيل ({due.length})</CardTitle>
            {due.length === 0 ? (
              <p className="text-sm text-muted">ما فيه شي مستحق اليوم.</p>
            ) : (
              due.map((x) => (
                <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {x.customer.name} · {x.service} · <Money value={x.amount.toString()} /> · موعده {date(x.nextBillingDate)}
                  </span>
                  <ChargeButton id={x.id} accounts={accounts} />
                </div>
              ))
            )}
          </Card>
          <Card>
            <CardTitle>هامش العملاء — هذا الشهر</CardTitle>
            <Margins rows={thisMonth} min={s.agencyMinMarginPct} />
            {lastMonth.length > 0 && (
              <>
                <div className="mb-2 mt-4 text-sm font-semibold">الشهر اللي راح</div>
                <Margins rows={lastMonth} min={s.agencyMinMarginPct} />
              </>
            )}
          </Card>
        </>
      )}

      {tab === "subs" && (
        <>
          <Card>
            <CardTitle>الاشتراكات</CardTitle>
            {subs.length === 0 ? (
              <Empty>ما فيه اشتراكات.</Empty>
            ) : (
              <div className="divide-y divide-border">
                {subs.map((x) => (
                  <div key={x.id} className="space-y-1 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <Link href={`/customers/${x.customer.id}`} className="font-medium">{x.customer.name}</Link>
                      <Badge tone={x.status === "ACTIVE" ? "ok" : x.status === "PAUSED" ? "warn" : "danger"}>{x.status === "ACTIVE" ? "نشط" : x.status === "PAUSED" ? "موقوف" : "ملغي"}</Badge>
                    </div>
                    <div className="text-xs text-muted">
                      {x.service} · <Money value={x.amount.toString()} />/شهر · التجديد {date(x.nextBillingDate)}
                    </div>
                    <SubscriptionControls id={x.id} status={x.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardTitle>اشتراك جديد</CardTitle>
            <NewSubscription customers={customers} />
          </Card>
        </>
      )}

      {tab === "tasks" && (
        <>
          <Card>
            <CardTitle>المهام</CardTitle>
            {tasks.length === 0 ? (
              <Empty>ما فيه مهام.</Empty>
            ) : (
              <div className="divide-y divide-border">
                {tasks.map((t) => (
                  <div key={t.id} className="space-y-1 py-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs text-muted">
                          {t.customer.name}
                          {t.freelancer && ` · ${t.freelancer.name}`}
                          {t.dueAt && ` · تسليم ${date(t.dueAt)}`} · <Money value={t.cost.toString()} />
                        </div>
                      </div>
                      <Badge tone={t.status === "APPROVED" ? "ok" : t.status === "DELIVERED" ? "info" : t.dueAt && t.dueAt < now ? "danger" : "neutral"}>{TASK_STATUS[t.status]}</Badge>
                    </div>
                    {t.deliveryUrl && (
                      <a href={t.deliveryUrl} target="_blank" rel="noreferrer" className="text-xs text-primary" dir="ltr">
                        {t.deliveryUrl}
                      </a>
                    )}
                    {t.deliveryNote && <div className="text-xs text-muted">{t.deliveryNote}</div>}
                    {t.status !== "APPROVED" && <OwnerTaskButtons id={t.id} status={t.status} />}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardTitle>مهمة جديدة</CardTitle>
            <NewTask customers={customers} freelancers={freelancers.filter((f) => f.active).map((f) => ({ id: f.id, name: f.name }))} subs={subs.filter((x) => x.status === "ACTIVE").map((x) => ({ id: x.id, label: `${x.customer.name} — ${x.service}`, customerId: x.customer.id }))} />
          </Card>
        </>
      )}

      {tab === "freelancers" && (
        <>
          <Card>
            <CardTitle>المستقلين</CardTitle>
            {freelancers.length === 0 ? (
              <Empty>ما فيه مستقلين.</Empty>
            ) : (
              <div className="divide-y divide-border">
                {freelancers.map((f) => {
                  const b = fBal.get(f.id);
                  return (
                    <div key={f.id} className="space-y-1 py-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {f.name} {!f.active && <Badge tone="danger">موقوف</Badge>}
                        </span>
                        <span className="text-xs text-muted">
                          مستحق <Money value={b?.due.toString() ?? "0"} className="font-semibold text-fg" /> · انصرف <Money value={b?.paid.toString() ?? "0"} />
                        </span>
                      </div>
                      <div className="text-xs text-muted">
                        {[f.skills, f.rateNote, f.phone].filter(Boolean).join(" · ")}
                      </div>
                      {b && b.due.gt(0) && <PayFreelancer freelancerId={f.id} due={b.due.toFixed(2)} accounts={accounts} />}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-muted">عشان المستقل يدخل ويشوف مهامه: الإعدادات ← المستخدمين ← حساب جديد بدور "مستقل".</p>
          </Card>
          <Card>
            <CardTitle>مستقل جديد</CardTitle>
            <FreelancerForm />
          </Card>
        </>
      )}
    </div>
  );
}

function Margins({ rows, min }: { rows: Awaited<ReturnType<typeof clientMargins>>; min: number }) {
  if (rows.length === 0) return <p className="text-sm text-muted">ما فيه اشتراكات مسجّلة في الشهر هذا.</p>;
  return (
    <div className="divide-y divide-border text-sm">
      {rows.map((r) => (
        <div key={r.customerId} className="flex items-center justify-between py-2">
          <span>{r.name}</span>
          <span className="flex items-center gap-2 text-xs text-muted">
            إيراد <Money value={r.revenue.toString()} /> · تنفيذ <Money value={r.cost.toString()} />
            <Badge tone={r.low ? "danger" : "ok"}>{r.marginPct ? `${r.marginPct.toFixed(0)}%` : "—"}</Badge>
          </span>
        </div>
      ))}
      {rows.some((r) => r.low) && <p className="pt-2 text-xs text-danger">الهامش أقل من {min}% — راجع التسعير أو تكلفة التنفيذ.</p>}
    </div>
  );
}
