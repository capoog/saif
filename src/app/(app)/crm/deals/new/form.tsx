"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createDealAction } from "@/server/actions/crm";
import type { ActionState } from "@/server/actions/run";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

export function DealForm({ customerId, customers, engines }: { customerId?: string; customers: { id: string; name: string; phone: string | null }[]; engines: { id: string; name: string; code: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(createDealAction, {});
  if (customers.length === 0)
    return (
      <p className="text-sm">
        ما فيه عملاء للحين. <Link href="/customers/new?next=deal" className="text-primary">أضف عميل الأول</Link>
      </p>
    );
  return (
    <form action={action} className="space-y-4">
      <Field label="العميل" hint={<Link href="/customers/new?next=deal" className="text-primary">+ عميل جديد</Link>}>
        <Select name="customerId" defaultValue={customerId ?? customers[0].id}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.phone ? ` — ${c.phone}` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="عنوان الصفقة">
        <Input name="title" required placeholder="مثلًا: هدايا رمضان للموظفين" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="القيمة المتوقعة">
          <Input name="value" inputMode="decimal" className="num" />
        </Field>
        <Field label="المحرك">
          <Select name="engineId" defaultValue={engines.find((e) => e.code === "B2B")?.id}>
            {engines.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="المرحلة">
          <Select name="stage" defaultValue="LEAD">
            <option value="LEAD">عميل محتمل</option>
            <option value="CONTACTED">تم التواصل</option>
            <option value="INTERESTED">مهتم</option>
            <option value="QUOTE_SENT">عرض سعر مرسل</option>
            <option value="NEGOTIATION">تفاوض</option>
          </Select>
        </Field>
        <Field label="المتابعة الجاية">
          <Input name="followUp" type="date" defaultValue={new Date(Date.now() + 3 * 3600000 + 86400000).toISOString().slice(0, 10)} />
        </Field>
      </div>
      <Field label="ملاحظات">
        <Textarea name="note" />
      </Field>
      <FormError state={state} />
      <SubmitButton size="lg">إضافة الصفقة</SubmitButton>
    </form>
  );
}
