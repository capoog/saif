import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { ImportForm } from "./form";

export default async function ImportPage() {
  await requireUser(["owner"]);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="استيراد عملاء من CSV" subtitle="من إكسل: حفظ باسم ← CSV UTF-8. أول سطر عناوين الأعمدة." />
      <ImportForm />
    </div>
  );
}
