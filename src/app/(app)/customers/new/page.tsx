import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { NewCustomerForm } from "./form";

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  await requireUser(["owner", "sales"]);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="عميل جديد" />
      <NewCustomerForm next={next} />
    </div>
  );
}
