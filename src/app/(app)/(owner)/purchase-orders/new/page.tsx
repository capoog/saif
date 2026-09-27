import Link from "next/link";
import { prisma } from "@/server/db";
import { materialNeeds } from "@/server/services/b2b";
import { PageHeader } from "@/components/ui";
import { POForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewPOPage({ searchParams }: { searchParams: Promise<{ supplierId?: string }> }) {
  const { supplierId } = await searchParams;
  const [suppliers, products, needs] = await Promise.all([
    prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { deletedAt: null, kind: "GOODS", status: { not: "AVOID" } }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    materialNeeds(prisma),
  ]);
  if (suppliers.length === 0)
    return (
      <p className="text-sm">
        أضف مورد الأول: <Link href="/suppliers/new" className="text-primary">+ مورد</Link>
      </p>
    );
  const shortfalls = needs.filter((n) => n.shortfall.gt(0)).map((n) => ({ productId: n.productId, quantity: n.shortfall.toString() }));
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="أمر شراء جديد" subtitle="عند الاستلام كل بند يتحول دفعة مخزون، والشحن يتوزع بنسبة القيمة." />
      <POForm
        supplierId={supplierId}
        suppliers={suppliers}
        products={products.map((p) => ({ id: p.id, name: p.name, unit: p.unit, cost: p.estimatedUnitCost?.toString() ?? "" }))}
        shortfalls={shortfalls}
      />
    </div>
  );
}
