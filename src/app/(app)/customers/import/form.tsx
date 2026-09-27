"use client";

import { useActionState, useState } from "react";
import { importCustomersAction } from "@/server/actions/crm";
import type { ActionState } from "@/server/actions/run";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

export function ImportForm() {
  const [state, action] = useActionState<ActionState, FormData>(importCustomersAction, {});
  const [csv, setCsv] = useState("");
  return (
    <form action={action} className="space-y-4">
      <Alert tone="info" title="الأعمدة المقبولة (عربي أو إنجليزي)">
        الاسم (إلزامي)، الجوال، النوع (شركة/فرد)، القطاع، جهة الاتصال، المدينة، الإيميل، القناة، ملاحظات. العملاء اللي جوالهم مسجل بيتخطّوا.
      </Alert>
      <Field label="اختار الملف">
        <Input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="pt-2.5"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setCsv(await f.text());
          }}
        />
      </Field>
      <Field label="أو الصق المحتوى هنا">
        <Textarea name="csv" value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} dir="auto" placeholder={"الاسم,الجوال,النوع,القطاع\nشركة الأمل,0551234567,شركة,مقاولات"} />
      </Field>
      {csv && <p className="text-xs text-muted">{csv.split(/\r?\n/).filter(Boolean).length} سطر</p>}
      <FormError state={state} />
      {state.ok && <Alert tone="ok">{state.message}</Alert>}
      <SubmitButton size="lg" disabled={!csv.trim()}>استيراد</SubmitButton>
    </form>
  );
}
