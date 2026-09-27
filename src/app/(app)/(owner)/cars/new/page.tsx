import { PageHeader } from "@/components/ui";
import { NewCarForm } from "./form";

export default function NewCarPage() {
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="سيارة جديدة" />
      <NewCarForm />
    </div>
  );
}
