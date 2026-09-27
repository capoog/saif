import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { effectiveQuoteStatus, QUOTE_STATUS_LABEL, quoteNumberLabel } from "@/server/services/quotes";
import { date } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, Money, PageHeader } from "@/components/ui";
import { ContractForm, QuoteActions } from "./client";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await prisma.quote.findUnique({ where: { id }, include: { customer: true, items: { orderBy: { sortOrder: "asc" } }, contract: true, deal: true } });
  if (!q) notFound();
  const st = effectiveQuoteStatus(q);
  const label = quoteNumberLabel(q);
  const deposit = (Number(q.total) * Number(q.depositPct)) / 100;
  const canConvert = !q.contract && st !== "REJECTED" && q.items.every((i) => i.productId);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={`عرض سعر ${label}`}
        subtitle={
          <>
            <Link href={`/customers/${q.customerId}`} className="text-primary">{q.customer.name}</Link> · {date(q.date)} · صالح حتى {date(q.validUntil)}
            {q.deal && ` · ${q.deal.title}`}
          </>
        }
        action={<Badge tone={st === "ACCEPTED" ? "ok" : st === "REJECTED" ? "danger" : st === "EXPIRED" ? "warn" : "info"}>{QUOTE_STATUS_LABEL[st]}</Badge>}
      />
      <QuoteActions id={q.id} label={label} status={q.status} phone={q.customer.phone} total={q.total.toString()} />

      <Card>
        <div className="divide-y divide-border text-sm">
          {q.items.map((i) => (
            <div key={i.id} className="flex justify-between gap-2 py-2">
              <span>
                {i.description} <span className="num text-muted">× {i.quantity} @ {Number(i.unitPrice).toFixed(2)}</span>
                {!i.productId && <Badge className="ms-1">بند حر</Badge>}
              </span>
              <Money value={i.lineTotal.toString()} />
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-sm">
          {!q.discount.isZero() && <Row l="خصم" v={`-${q.discount}`} />}
          {!q.shippingFee.isZero() && <Row l="شحن" v={q.shippingFee.toString()} />}
          {!q.vatAmount.isZero() && <Row l="ضريبة القيمة المضافة" v={q.vatAmount.toString()} />}
          <Row l="الإجمالي" v={q.total.toString()} b />
          <Row l={`العربون ${q.depositPct.toString()}%`} v={deposit.toFixed(2)} />
        </div>
      </Card>

      {q.contract ? (
        <Alert tone="ok" title={`اتحول لعقد #${q.contract.number}`}>
          <Link href={`/b2b/${q.contract.id}`} className="underline">افتح العقد</Link>
        </Alert>
      ) : canConvert ? (
        <Card>
          <CardTitle>العميل وافق؟ حوّله لعقد</CardTitle>
          <ContractForm quoteId={q.id} items={q.items.map((i) => ({ description: i.description, quantity: i.quantity }))} />
        </Card>
      ) : (
        st !== "REJECTED" && <Alert tone="info">عشان يتحول لعقد، كل البنود لازم تكون منتجات من المخزون (مش بنود حرة).</Alert>
      )}
    </div>
  );
}

function Row({ l, v, b }: { l: string; v: string; b?: boolean }) {
  return (
    <div className={`flex justify-between ${b ? "font-semibold" : ""}`}>
      <span className={b ? "" : "text-muted"}>{l}</span>
      <Money value={v} />
    </div>
  );
}
