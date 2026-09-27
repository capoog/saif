import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { accountBalances } from "@/server/services/balances";
import { contractDetail, quoteNumberLabel } from "@/server/services/quotes";
import { ORDER_STATUS, ORDER_STATUS_TONE } from "@/lib/labels";
import { date } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, Money, PageHeader, Stat } from "@/components/ui";
import { CancelContract, ContractPayment } from "./client";

export const dynamic = "force-dynamic";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const d = await contractDetail(prisma, (await params).id);
  if (!d) notFound();
  const { contract: k } = d;
  const accounts = (await accountBalances(prisma)).filter((b) => b.isMoney && !b.isTaxReserve).map((b) => ({ id: b.id, name: b.name, code: b.code }));
  const depositLeft = Math.max(Number(d.depositTarget) - Number(d.paid), 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={`عقد #${k.number} — ${k.customer.name}`}
        subtitle={
          <>
            وُقّع {date(k.signedAt)}
            {k.quote && (
              <>
                {" "}· من <Link href={`/quotes/${k.quote.id}`} className="text-primary num">{quoteNumberLabel(k.quote)}</Link>
              </>
            )}
          </>
        }
        action={<Badge tone={k.status === "COMPLETED" ? "ok" : k.status === "CANCELLED" ? "danger" : "info"}>{k.status === "COMPLETED" ? "مكتمل" : k.status === "CANCELLED" ? "ملغي" : "ساري"}</Badge>}
      />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="قيمة العقد" value={<Money value={k.total.toString()} />} />
        <Stat label="المحصّل" value={<Money value={d.paid.toString()} />} sub={d.depositReceived ? "العربون وصل ✓" : `العربون ${k.depositPct.toString()}%: ${d.depositTarget.toFixed(2)}`} tone={d.depositReceived ? "ok" : "warn"} />
        <Stat label="المتبقي" value={<Money value={d.due.toString()} />} />
      </div>
      {!d.depositReceived && k.status === "ACTIVE" && (
        <Alert tone="warn" title="العربون للحين ما وصل">
          العقد ما يتحسب في عدّاد رمضان غير بعد العربون. ابدأ التجهيز بعد ما يوصل.
        </Alert>
      )}

      <Card>
        <CardTitle>جدول التسليم</CardTitle>
        <div className="divide-y divide-border">
          {d.orders.map((o, i) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="block py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  دفعة {i + 1} · {date(o.scheduledFor)}
                </span>
                <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS[o.status]}</Badge>
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>{o.items.map((it) => `${it.product.name} ×${it.quantity}`).join("، ")}</span>
                <span>
                  <Money value={o.total.toString()} /> · مدفوع <Money value={o.paid.toString()} />
                </span>
              </div>
            </Link>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">التسليم والتحصيل لكل دفعة من صفحة الطلب حقها. التكلفة تتخصم من مكونات البوكس بـ FIFO وقت التسليم.</p>
      </Card>

      {k.status === "ACTIVE" && d.due.gt(0) && (
        <Card>
          <CardTitle>تسجيل دفعة من العميل</CardTitle>
          <ContractPayment id={k.id} suggested={(depositLeft > 0 ? depositLeft : Number(d.due)).toFixed(2)} accounts={accounts} />
        </Card>
      )}
      {k.status === "ACTIVE" && d.delivered === 0 && (
        <Card>
          <CancelContract id={k.id} />
        </Card>
      )}
    </div>
  );
}
