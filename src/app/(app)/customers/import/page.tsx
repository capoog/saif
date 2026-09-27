import { PageHeader } from "@/components/ui";
import { ImportForm } from "./form";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="استيراد عملاء من CSV" subtitle="من إكسل: حفظ باسم ← CSV UTF-8. أول سطر عناوين الأعمدة." />
      <ImportForm />
    </div>
  );
}
