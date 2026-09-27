import Link from "next/link";
import { prisma } from "@/server/db";
import { supplierBalances } from "@/server/services/suppliers";
import { date } from "@/lib/format";
import { Badge, ButtonLink, Card, CardTitle, Empty, Money, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const PO_STATUS = { DRAFT: "مسودة", ORDERED: "مطلوب", RECEIVED: "مستلم", CANCELLED: "ملغي" } as const;

export default async function SuppliersPage() {
  const [suppliers, balances, pos] = await Promise.all([
    prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    supplierBalances(prisma),
    prisma.purchaseOrder.findMany({ where: { status: { in: ["ORDERED", "DRAFT"] } }, orderBy: { date: "desc" }, include: { supplier: { select: { name: true } } } }),
  ]);
  const totalDue = [...balances.values()].reduce((s, b) => s + Number(b), 0);
  return (
    <div className="space-y-4">
      <PageHeader
        title="الموردين"
        subtitle={<>مستحقات عليك: <Money value={totalDue} className="font-semibold text-fg" /></>}
        action={
          <div className="flex gap-2">
            <ButtonLink href="/purchase-orders/new" size="sm" variant="secondary">+ أمر شراء</ButtonLink>
            <ButtonLink href="/suppliers/new" size="sm">+ مورد</ButtonLink>
          </div>
        }
      />
      {pos.length > 0 && (
        <Card>
          <CardTitle>أوامر شراء مستنية الاستلام</CardTitle>
          {pos.map((p) => (
            <Link key={p.id} href={`/purchase-orders/${p.id}`} className="flex justify-between py-2 text-sm">
              <span>
                <span className="num">#{p.number}</span> · {p.supplier.name}
              </span>
              <span className="text-xs text-muted">
                {PO_STATUS[p.status as keyof typeof PO_STATUS]} {p.expectedAt && `· متوقع ${date(p.expectedAt)}`}
              </span>
            </Link>
          ))}
        </Card>
      )}
      {suppliers.length === 0 ? (
        <Empty>مفيش موردين. المورد المسجل بيتحسبله مستحقاته لوحده.</Empty>
      ) : (
        suppliers.map((s) => {
          const due = balances.get(s.id);
          return (
            <Link key={s.id} href={`/suppliers/${s.id}`} className="block">
              <Card className="mb-2 flex items-center justify-between p-3 hover:border-primary/50">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted">
                    {s.type}
                    {s.city && ` · ${s.city}`}
                    {s.rating && ` · ${"★".repeat(s.rating)}`}
                  </div>
                </div>
                {due && due.gt(0) ? <Badge tone="warn">عليك <Money value={due.toString()} className="mx-1" /></Badge> : <span className="text-xs text-muted">مفيش مستحقات</span>}
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
