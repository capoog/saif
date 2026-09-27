import Link from "next/link";
import { prisma } from "@/server/db";
import { costEstimates } from "@/server/services/inventory";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui";
import { QuoteForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ customerId?: string; dealId?: string }> }) {
  const { customerId, dealId } = await searchParams;
  const [customers, products, costs, settings, deals] = await Promise.all([
    prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { deletedAt: null, status: { not: "AVOID" } }, orderBy: [{ kind: "desc" }, { name: "asc" }] }),
    costEstimates(prisma),
    getSettings(prisma),
    prisma.deal.findMany({ where: { deletedAt: null, stage: { notIn: ["WON", "LOST"] } }, select: { id: true, title: true, customerId: true } }),
  ]);
  if (customers.length === 0)
    return (
      <p className="text-sm">
        مفيش عملاء. <Link href="/customers/new?next=quote" className="text-primary">أضف عميل الأول</Link>
      </p>
    );
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="عرض سعر جديد" />
      <QuoteForm
        customerId={customerId}
        dealId={dealId}
        customers={customers}
        deals={deals}
        products={products.map((p) => ({ id: p.id, name: p.name, isBox: p.kind === "BOX", price: p.defaultSellPrice?.toString() ?? "", cost: costs.get(p.id)?.toFixed(2) ?? null }))}
        defaults={{ validityDays: settings.quoteValidityDays, depositPct: settings.b2bDepositPct, vatRegistered: settings.vatRegistered, vatRatePct: settings.vatRatePct, inclusive: settings.pricesIncludeVat }}
      />
    </div>
  );
}
