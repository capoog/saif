import Link from "next/link";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/ui";
import { NewProjectForm } from "./form";

export default async function NewProjectPage() {
  const customers = await prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  if (customers.length === 0)
    return (
      <p className="text-sm">
        أضف الجهة كعميل أول: <Link href="/customers/new" className="text-primary">+ عميل</Link>
      </p>
    );
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="مشروع جديد" />
      <NewProjectForm customers={customers} />
    </div>
  );
}
