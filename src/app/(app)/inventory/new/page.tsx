import { prisma } from "@/server/db";
import { accountBalances } from "@/server/services/balances";
import { PageHeader } from "@/components/ui";
import { BatchForm } from "./batch-form";

export default async function NewBatchPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  const { productId } = await searchParams;
  const [products, balances] = await Promise.all([
    prisma.product.findMany({ where: { deletedAt: null, status: { not: "AVOID" } }, orderBy: [{ category: "asc" }, { number: "asc" }] }),
    accountBalances(prisma),
  ]);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="شراء دفعة مخزون" subtitle="التكلفة شاملة الشحن. البيع بيخصم من أقدم دفعة (FIFO)." />
      <BatchForm
        productId={productId}
        products={products.map((p) => ({ id: p.id, name: p.name, category: p.category, buyRange: p.buyPriceRange, sellPrice: p.defaultSellPrice?.toString() ?? "" }))}
        accounts={balances.filter((b) => b.isMoney && !b.isTaxReserve).map((b) => ({ id: b.id, name: b.name, code: b.code, balance: b.balance.toFixed(2) }))}
      />
    </div>
  );
}
