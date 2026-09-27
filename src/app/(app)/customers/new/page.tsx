import { PageHeader } from "@/components/ui";
import { NewCustomerForm } from "./form";

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="عميل جديد" />
      <NewCustomerForm next={next} />
    </div>
  );
}
