import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { accountBalances } from "@/server/services/balances";
import { supplierBalances } from "@/server/services/suppliers";
import { date } from "@/lib/format";
import { ButtonLink, Card, CardTitle, Money, PageHeader, Stat } from "@/components/ui";
import { EditSupplier, PaySupplier } from "./client";

export const dynamic = "force-dynamic";
const PO_STATUS = { DRAFT: "مسودة", ORDERED: "مطلوب", RECEIVED: "مستلم", CANCELLED: "ملغي" } as const;

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await prisma.supplier.findUnique({
    where: { id },
    include: {
      purchaseOrders: { orderBy: { date: "desc" }, take: 30, include: { items: true } },
      batches: { where: { deletedAt: null }, orderBy: { receivedAt: "desc" }, take: 20, include: { product: { select: { name: true, unit: true } } } },
    },
  });
  if (!s) notFound();
  const due = (await supplierBalances(prisma)).get(id);
  const accounts = (await accountBalances(prisma)).filter((b) => b.isMoney && !b.isTaxReserve).map((b) => ({ id: b.id, name: b.name, code: b.code, balance: b.balance.toFixed(2) }));
  const bought = s.batches.reduce((sum, b) => sum + Number(b.totalCost), 0);
  return (
    <div className="space-y-4">
      <PageHeader title={s.name} subtitle={`${s.type}${s.city ? ` · ${s.city}` : ""}${s.phone ? ` · ${s.phone}` : ""}`} action={<ButtonLink href={`/purchase-orders/new?supplierId=${id}`} size="sm">+ أمر شراء</ButtonLink>} />
      <div className="grid grid-cols-2 gap-2">
        <Stat label="المستحق له" value={<Money value={due?.toString() ?? "0"} />} tone={due?.gt(0) ? "warn" : undefined} />
        <Stat label="مشتريات (آخر 20 دفعة)" value={<Money value={bought} />} />
      </div>
      {due && due.gt(0) && (
        <Card>
          <CardTitle>سداد</CardTitle>
          <PaySupplier supplierId={id} due={due.toFixed(2)} accounts={accounts} />
        </Card>
      )}
      <Card>
        <CardTitle>أوامر الشراء</CardTitle>
        {s.purchaseOrders.length === 0 ? (
          <p className="text-sm text-muted">مفيش.</p>
        ) : (
          s.purchaseOrders.map((p) => (
            <Link key={p.id} href={`/purchase-orders/${p.id}`} className="flex justify-between py-2 text-sm">
              <span>
                <span className="num">#{p.number}</span> · {date(p.date)} · {p.items.length} بند
              </span>
              <span className="text-xs text-muted">{PO_STATUS[p.status as keyof typeof PO_STATUS]}</span>
            </Link>
          ))
        )}
      </Card>
      {s.batches.length > 0 && (
        <Card>
          <CardTitle>آخر الدفعات منه</CardTitle>
          {s.batches.map((b) => (
            <div key={b.id} className="flex justify-between py-1.5 text-sm">
              <span>
                {b.product.name} <span className="num text-muted">× {b.quantity.toString()} {b.product.unit}</span>
              </span>
              <span className="text-xs text-muted">
                {date(b.receivedAt)} · <Money value={b.totalCost.toString()} />
              </span>
            </div>
          ))}
        </Card>
      )}
      <Card>
        <CardTitle>البيانات</CardTitle>
        <EditSupplier s={{ id: s.id, name: s.name, type: s.type, phone: s.phone, contact: s.contact, city: s.city, rating: s.rating, notes: s.notes }} />
      </Card>
    </div>
  );
}
