import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { ButtonLink, Card, Empty, Input, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const where: Prisma.CustomerWhereInput = { deletedAt: null };
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }, { sector: { contains: q, mode: "insensitive" } }];
  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { orders: true, deals: true } } },
  });
  return (
    <div className="space-y-4">
      <PageHeader
        title="العملاء"
        subtitle={`${customers.length}${customers.length === 200 ? "+" : ""} عميل`}
        action={
          <div className="flex gap-2">
            <ButtonLink href="/customers/import" size="sm" variant="secondary">استيراد CSV</ButtonLink>
            <ButtonLink href="/customers/new" size="sm">+ عميل</ButtonLink>
          </div>
        }
      />
      <form>
        <Input name="q" defaultValue={q} placeholder="بحث بالاسم أو الجوال أو القطاع" />
      </form>
      {customers.length === 0 ? (
        <Empty>ما فيه عملاء.</Empty>
      ) : (
        <div className="space-y-2">
          {customers.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} className="block">
              <Card className="flex items-center justify-between p-3 hover:border-primary/50">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted">
                    {c.type === "company" ? "شركة" : "فرد"}
                    {c.sector && ` · ${c.sector}`}
                    {c.city && ` · ${c.city}`}
                  </div>
                </div>
                <div className="text-end text-xs text-muted">
                  {c.phone && <div className="num">{c.phone}</div>}
                  <div>
                    {c._count.orders} طلب · {c._count.deals} صفقة
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
