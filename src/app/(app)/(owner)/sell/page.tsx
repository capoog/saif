import Link from "next/link";
import { prisma } from "@/server/db";
import { QUICK_SALE_KINDS } from "@/server/services/businesses";
import { Empty, PageHeader, cn } from "@/components/ui";
import { QuickSale } from "./client";

export const dynamic = "force-dynamic";

export default async function SellPage({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const { b } = await searchParams;
  const engines = await prisma.engine.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const withSale = engines.filter((e) => QUICK_SALE_KINDS.includes(e.kind) || e.code === "ECOM");
  const current = engines.find((e) => e.id === b) ?? withSale.find((e) => e.kind !== "CORE") ?? withSale[0];
  const products = current
    ? await prisma.product.findMany({
        where: { engineId: current.id, deletedAt: null, status: { notIn: ["STOPPED", "AVOID"] }, defaultSellPrice: { not: null } },
        orderBy: [{ category: "asc" }, { name: "asc" }],
        select: { id: true, name: true, category: true, defaultSellPrice: true },
      })
    : [];
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <PageHeader title="بيع سريع" subtitle="اضغط على الصنف، واختر طريقة الدفع — ينسجل مسلّم ومدفوع" />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {withSale.map((e) => (
          <Link key={e.id} href={`/sell?b=${e.id}`} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", e.id === current?.id ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border")}>
            {e.name}
          </Link>
        ))}
      </div>
      {!current || products.length === 0 ? (
        <Empty>
          ما فيه أصناف بسعر بيع في هالنشاط.{" "}
          <Link href={current ? `/products/new?engine=${current.id}` : "/businesses"} className="text-primary">
            أضف صنف
          </Link>
        </Empty>
      ) : (
        <QuickSale key={current.id} engineId={current.id} products={products.map((p) => ({ id: p.id, name: p.name, category: p.category, price: Number(p.defaultSellPrice) }))} />
      )}
    </div>
  );
}
