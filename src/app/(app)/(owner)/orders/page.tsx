import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { ORDER_STATUS, ORDER_STATUS_TONE as statusTone, PAYMENT_STATUS } from "@/lib/labels";
import { dateTime } from "@/lib/format";
import { Badge, ButtonLink, Card, Empty, Money, PageHeader, cn } from "@/components/ui";

export const dynamic = "force-dynamic";

const FILTERS = [
  { v: "", l: "الكل" },
  { v: "open", l: "مفتوحة" },
  { v: "unpaid", l: "عليها فلوس" },
  { v: "noinvoice", l: "بدون فاتورة رسمية" },
  { v: "returned", l: "مرتجع/ملغي" },
];


export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter = "" } = await searchParams;
  const where: Prisma.OrderWhereInput = { deletedAt: null };
  if (filter === "open") where.status = { in: ["NEW", "CONFIRMED", "SHIPPED"] };
  if (filter === "unpaid") Object.assign(where, { status: { notIn: ["CANCELLED", "RETURNED"] }, paymentStatus: { in: ["UNPAID", "PARTIAL"] } });
  if (filter === "noinvoice") Object.assign(where, { status: "DELIVERED", officialInvoiceNo: null });
  if (filter === "returned") where.status = { in: ["RETURNED", "CANCELLED"] };

  const orders = await prisma.order.findMany({
    where,
    orderBy: { date: "desc" },
    take: 100,
    include: { customer: true, items: { include: { product: { select: { name: true } } } }, payments: { where: { deletedAt: null }, select: { amount: true } } },
  });

  return (
    <div className="space-y-4">
      <PageHeader title="الطلبات" action={<ButtonLink href="/orders/new" size="sm">+ طلب</ButtonLink>} />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <Link key={f.v} href={f.v ? `/orders?filter=${f.v}` : "/orders"} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", filter === f.v ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border")}>
            {f.l}
          </Link>
        ))}
      </div>
      {orders.length === 0 ? (
        <Empty>ما فيه طلبات هنا.</Empty>
      ) : (
        orders.map((o) => {
          const paid = o.payments.reduce((s, p) => s + Number(p.amount), 0);
          const due = Number(o.total) - paid;
          return (
            <Link key={o.id} href={`/orders/${o.id}`} className="block">
              <Card className="mb-2 p-3 hover:border-primary/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      <span className="num text-muted">#{o.number}</span> {o.customer?.name ?? o.channel}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {dateTime(o.date)} · {o.channel} · {o.items.map((i) => `${i.product.name} ×${i.quantity}`).join("، ")}
                    </div>
                  </div>
                  <Money value={o.total.toString()} className="font-bold" />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={statusTone[o.status]}>{ORDER_STATUS[o.status]}</Badge>
                  <Badge tone={o.paymentStatus === "PAID" ? "ok" : o.paymentStatus === "PARTIAL" ? "warn" : "neutral"}>{PAYMENT_STATUS[o.paymentStatus]}</Badge>
                  {due > 0.004 && !["CANCELLED", "RETURNED"].includes(o.status) && (
                    <Badge tone="warn">متبقي <span className="num mx-1">{due.toFixed(2)}</span></Badge>
                  )}
                  {o.status === "DELIVERED" && !o.officialInvoiceNo && <Badge>بدون فاتورة رسمية</Badge>}
                </div>
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
