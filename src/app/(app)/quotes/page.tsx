import Link from "next/link";
import { prisma } from "@/server/db";
import { effectiveQuoteStatus, QUOTE_STATUS_LABEL, quoteNumberLabel } from "@/server/services/quotes";
import { date } from "@/lib/format";
import { Badge, ButtonLink, Card, Empty, Money, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const tone = { DRAFT: "neutral", SENT: "info", ACCEPTED: "ok", REJECTED: "danger", EXPIRED: "warn" } as const;

export default async function QuotesPage() {
  const quotes = await prisma.quote.findMany({ orderBy: { date: "desc" }, take: 100, include: { customer: { select: { name: true } } } });
  return (
    <div className="space-y-4">
      <PageHeader title="عروض الأسعار" action={<ButtonLink href="/quotes/new" size="sm">+ عرض سعر</ButtonLink>} />
      {quotes.length === 0 ? (
        <Empty>ما فيه عروض للحين.</Empty>
      ) : (
        quotes.map((q) => {
          const st = effectiveQuoteStatus(q);
          return (
            <Link key={q.id} href={`/quotes/${q.id}`} className="block">
              <Card className="mb-2 flex items-center justify-between p-3 hover:border-primary/50">
                <div>
                  <div className="font-medium">{q.customer.name}</div>
                  <div className="text-xs text-muted">
                    <span className="num">{quoteNumberLabel(q)}</span> · {date(q.date)} · صالح حتى {date(q.validUntil)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Money value={q.total.toString()} className="font-bold" />
                  <Badge tone={tone[st]}>{QUOTE_STATUS_LABEL[st]}</Badge>
                </div>
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
