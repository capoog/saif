import { prisma } from "@/server/db";
import { PageHeader } from "@/components/ui";
import { DealForm } from "./form";

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const { customerId } = await searchParams;
  const [customers, engines] = await Promise.all([
    prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, name: true, phone: true } }),
    prisma.engine.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="صفقة جديدة" />
      <DealForm customerId={customerId} customers={customers} engines={engines.map((e) => ({ id: e.id, name: e.name, code: e.code }))} />
    </div>
  );
}
