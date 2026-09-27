import Link from "next/link";
import type { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { stockLevels } from "@/server/services/inventory";
import { PRODUCT_STATUS } from "@/lib/labels";
import { Badge, ButtonLink, Card, Input, Money, PageHeader, Select, cn } from "@/components/ui";

export const dynamic = "force-dynamic";

const statusTone: Record<ProductStatus, "ok" | "info" | "warn" | "danger" | "neutral"> = {
  PRIORITY_TEST: "info",
  TESTING: "warn",
  ACTIVE: "ok",
  STOPPED: "danger",
  LATER: "neutral",
  AVOID: "danger",
};

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; stock?: string }> }) {
  const { q, status, stock } = await searchParams;
  const where: Prisma.ProductWhereInput = { deletedAt: null };
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (status && status in PRODUCT_STATUS) where.status = status as ProductStatus;
  const [products, levels] = await Promise.all([
    prisma.product.findMany({ where, orderBy: [{ status: "asc" }, { number: "asc" }] }),
    stockLevels(prisma),
  ]);
  const rows = products.filter((p) => stock !== "1" || (levels.get(p.id)?.onHand.gt(0) ?? false));
  const totalValue = [...levels.values()].reduce((s, l) => s + Number(l.value), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="المنتجات والمخزون"
        subtitle={<>قيمة المخزون بالتكلفة: <Money value={totalValue} className="font-semibold text-fg" /></>}
        action={
          <div className="flex gap-2">
            <ButtonLink href="/products/new" size="sm" variant="secondary">+ منتج</ButtonLink>
            <ButtonLink href="/inventory/new" size="sm">+ شراء دفعة</ButtonLink>
          </div>
        }
      />
      <form className="grid grid-cols-[1fr_auto] gap-2 md:grid-cols-[1fr_auto_auto_auto]">
        <Input name="q" defaultValue={q} placeholder="بحث باسم المنتج" />
        <Select name="status" defaultValue={status ?? ""} className="w-auto">
          <option value="">كل الحالات</option>
          {Object.entries(PRODUCT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="stock" value="1" defaultChecked={stock === "1"} className="size-5" /> في المخزون
        </label>
        <button className="h-12 rounded-xl bg-subtle px-4 text-sm font-semibold">تصفية</button>
      </form>

      <div className="space-y-2">
        {rows.map((p) => {
          const l = levels.get(p.id);
          return (
            <Link key={p.id} href={`/products/${p.id}`}>
              <Card className={cn("mb-2 flex items-center justify-between gap-3 p-3 hover:border-primary/50", p.status === "AVOID" && "opacity-60")}>
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {p.number && <span className="num text-muted">#{p.number} </span>}
                    {p.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <Badge tone={statusTone[p.status]}>{PRODUCT_STATUS[p.status]}</Badge>
                    <span>{p.category}</span>
                    {p.sellPriceRange && <span>· بيع تقديري {p.sellPriceRange}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-end text-sm">
                  <div className="num font-semibold">{l?.onHand.toString() ?? 0} <span className="text-xs font-normal text-muted">{p.unit}</span></div>
                  {l && l.reserved.gt(0) && <div className="text-xs text-muted">محجوز <span className="num">{l.reserved.toString()}</span></div>}
                  {l && l.onHand.gt(0) && <Money value={l.value.toString()} className="text-xs text-muted" />}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
