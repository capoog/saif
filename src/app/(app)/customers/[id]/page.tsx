import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { ACTIVITY_TYPES, DEAL_STAGES } from "@/server/services/crm";
import { effectiveQuoteStatus, QUOTE_STATUS_LABEL, quoteNumberLabel } from "@/server/services/quotes";
import { ORDER_STATUS } from "@/lib/labels";
import { date, dateTime } from "@/lib/format";
import { Badge, ButtonLink, Card, CardTitle, Money, PageHeader } from "@/components/ui";
import { LogButtons } from "../../crm/client";
import { EditCustomer } from "./edit";

export const dynamic = "force-dynamic";

const stageLabel = new Map(DEAL_STAGES.map((s) => [s.stage, s.label]));
const activityLabel = new Map(ACTIVITY_TYPES.map((a) => [a.code, a.label]));

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      deals: { where: { deletedAt: null }, orderBy: { updatedAt: "desc" } },
      quotes: { orderBy: { date: "desc" } },
      orders: { where: { deletedAt: null }, orderBy: { date: "desc" }, take: 20 },
      contracts: { orderBy: { signedAt: "desc" } },
      activities: { orderBy: { date: "desc" }, take: 20 },
    },
  });
  if (!c) notFound();
  const lifetime = c.orders.filter((o) => o.status === "DELIVERED").reduce((s, o) => s + Number(o.netRevenue), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title={c.name}
        subtitle={
          <>
            {c.type === "company" ? "شركة" : "فرد"}
            {c.sector && ` · ${c.sector}`}
            {c.contact && ` · ${c.contact}`} · مبيعات <Money value={lifetime} />
          </>
        }
        action={
          <div className="flex gap-2">
            <ButtonLink href={`/crm/deals/new?customerId=${c.id}`} size="sm" variant="secondary">+ صفقة</ButtonLink>
            <ButtonLink href={`/quotes/new?customerId=${c.id}`} size="sm">+ عرض سعر</ButtonLink>
          </div>
        }
      />
      {c.phone && (
        <div className="flex gap-2">
          <a href={`tel:${c.phone}`} className="flex-1 rounded-xl bg-subtle py-2.5 text-center text-sm font-semibold">اتصال <span className="num">{c.phone}</span></a>
          <a href={`https://wa.me/966${c.phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer" className="flex-1 rounded-xl bg-subtle py-2.5 text-center text-sm font-semibold">واتساب</a>
        </div>
      )}

      <Card>
        <CardTitle>سجّل تواصل</CardTitle>
        <LogButtons customerId={c.id} dealId={c.deals.find((d) => d.stage !== "WON" && d.stage !== "LOST")?.id} />
      </Card>

      {c.deals.length > 0 && (
        <Card>
          <CardTitle>الصفقات</CardTitle>
          <div className="divide-y divide-border text-sm">
            {c.deals.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2">
                <span>{d.title}</span>
                <span className="flex items-center gap-2">
                  {d.value && <Money value={d.value.toString()} />}
                  <Badge tone={d.stage === "WON" ? "ok" : d.stage === "LOST" ? "danger" : "info"}>{stageLabel.get(d.stage)}</Badge>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {c.quotes.length > 0 && (
        <Card>
          <CardTitle>عروض الأسعار</CardTitle>
          <div className="divide-y divide-border text-sm">
            {c.quotes.map((q) => (
              <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between py-2">
                <span className="num">{quoteNumberLabel(q)}</span>
                <span className="flex items-center gap-2">
                  <Money value={q.total.toString()} />
                  <Badge>{QUOTE_STATUS_LABEL[effectiveQuoteStatus(q)]}</Badge>
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {c.contracts.length > 0 && (
        <Card>
          <CardTitle>العقود</CardTitle>
          {c.contracts.map((k) => (
            <Link key={k.id} href={`/b2b/${k.id}`} className="flex justify-between py-2 text-sm">
              <span>عقد <span className="num">#{k.number}</span> · {date(k.signedAt)}</span>
              <Money value={k.total.toString()} />
            </Link>
          ))}
        </Card>
      )}

      {c.orders.length > 0 && (
        <Card>
          <CardTitle>الطلبات</CardTitle>
          <div className="divide-y divide-border text-sm">
            {c.orders.map((o) => (
              <Link key={o.id} href={`/orders/${o.id}`} className="flex justify-between py-2">
                <span>
                  <span className="num">#{o.number}</span> · {date(o.date)} · {ORDER_STATUS[o.status]}
                </span>
                <Money value={o.total.toString()} />
              </Link>
            ))}
          </div>
        </Card>
      )}

      {c.activities.length > 0 && (
        <Card>
          <CardTitle>آخر التواصلات</CardTitle>
          <div className="space-y-1 text-xs text-muted">
            {c.activities.map((a) => (
              <div key={a.id}>
                {dateTime(a.date)} · {activityLabel.get(a.type) ?? a.type}
                {a.note && ` · ${a.note}`}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>البيانات</CardTitle>
        <EditCustomer c={{ id: c.id, name: c.name, type: c.type, phone: c.phone, email: c.email, city: c.city, sector: c.sector, contact: c.contact, channel: c.channel, notes: c.notes }} />
      </Card>
    </div>
  );
}
