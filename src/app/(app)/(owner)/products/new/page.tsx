import { prisma } from "@/server/db";
import { PageHeader } from "@/components/ui";
import { NewProductForm } from "./form";

export default async function NewProductPage() {
  const [engines, cats] = await Promise.all([
    prisma.engine.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.product.findMany({ distinct: ["category"], select: { category: true } }),
  ]);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="منتج جديد" />
      <NewProductForm engines={engines.map((e) => ({ id: e.id, name: e.name, code: e.code }))} categories={cats.map((c) => c.category)} />
    </div>
  );
}
