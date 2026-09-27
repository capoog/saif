import { PageHeader } from "@/components/ui";
import { NewSupplierForm } from "./form";

export default function NewSupplierPage() {
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="مورد جديد" />
      <NewSupplierForm />
    </div>
  );
}
