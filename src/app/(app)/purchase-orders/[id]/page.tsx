import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { accountBalances } from "@/server/services/balances";
import { poTotals } from "@/server/services/suppliers";
import { date } from "@/lib/format";
import { Badge, Card, CardTitle, Money, PageHeader } from "@/components/ui";
import { CancelPO, ReceivePO } from "./client";

export const dynamic = "force-dynamic";
const PO_STATUS = { DRAFT: "مسودة", ORDERED: "مطلوب", RECEIVED: "مستلم", CANCELLED: "ملغي" } as const;

export default async function POPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { supplier: true, items: { include: { product: { select: { name: true, unit: true } } } } } });
  if (!po) notFound();
  const t = poTotals(po.items, po.extraCosts);
  const open = po.status === "ORDERED" || po.status === "DRAFT";
  const accounts = open ? (await accountBalances(prisma)).filter((b) => b.isMoney && !b.isTaxReserve).map((b) => ({ id: b.id, name: b.name, code: b.code, balance: b.balance.toFixed(2) })) : [];
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title={`أمر شراء #${po.number}`}
        subtitle={
          <>
            <Link href={`/suppliers/${po.supplierId}`} className="text-primary">{po.supplier.name}</Link> · {date(po.date)}
            {po.expectedAt && ` · متوقع ${date(po.expectedAt)}`}
          </>
        }
        action={<Badge tone={po.status === "RECEIVED" ? "ok" : po.status === "CANCELLED" ? "danger" : "info"}>{PO_STATUS[po.status as keyof typeof PO_STATUS]}</Badge>}
      />
      <Card>
        {po.items.map((i) => (
          <div key={i.id} className="flex justify-between py-2 text-sm">
            <span>
              {i.product.name}{" "}
              <span className="num text-muted">
                × {i.quantity.toString()} {i.product.unit} @ {Number(i.unitPrice).toFixed(2)}
              </span>
            </span>
            <Money value={(Number(i.quantity) * Number(i.unitPrice)).toFixed(2)} />
          </div>
        ))}
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-sm">
          {t.extra.gt(0) && (
            <div className="flex justify-between text-muted">
              <span>شحن وجمارك</span>
              <Money value={t.extra.toString()} />
            </div>
          )}
          <div className="flex justify-between font-semibold">
            <span>الإجمالي</span>
            <Money value={t.total.toString()} />
          </div>
        </div>
        {po.note && <p className="mt-2 text-xs text-muted">{po.note}</p>}
      </Card>
      {open && (
        <>
          <Card>
            <CardTitle>استلام</CardTitle>
            <ReceivePO id={po.id} total={t.total.toFixed(2)} accounts={accounts} />
          </Card>
          <CancelPO id={po.id} />
        </>
      )}
    </div>
  );
}
