"use client";

import { useActionState } from "react";
import { createProductAction } from "@/server/actions/inventory";
import type { ActionState } from "@/server/actions/run";
import { Field, Input, Select } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

export function NewProductForm({ engines, categories, engineId }: { engines: { id: string; name: string; code: string }[]; categories: string[]; engineId?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(createProductAction, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="اسم المنتج">
        <Input name="name" required autoFocus />
      </Field>
      <Field label="الفئة">
        <Input name="category" list="cats" required />
        <datalist id="cats">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="النشاط">
          <Select name="engineId" defaultValue={engineId ?? engines.find((e) => e.code === "ECOM")?.id}>
            {engines.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="الوحدة">
          <Input name="unit" defaultValue="قطعة" />
        </Field>
      </div>
      <Field label="النوع" hint="الصنف بمكونات (بوكس، طبق، مشروب) مخزونه يتخصم من مكوناته">
        <Select name="kind" defaultValue="GOODS">
          <option value="GOODS">منتج / مادة بمخزون</option>
          <option value="BOX">صنف بمكونات (بوكس / طبق / مشروب)</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="سعر البيع الافتراضي">
          <Input name="defaultSellPrice" inputMode="decimal" className="num" />
        </Field>
        <Field label="تكلفة تقديرية للوحدة" hint="للتسعير قبل أول شراء">
          <Input name="estimatedUnitCost" inputMode="decimal" className="num" />
        </Field>
      </div>
      <Field label="رمز المنتج في المتجر (SKU)" hint="اختياري — لربط طلبات سلة وزد تلقائي">
        <Input name="sku" dir="ltr" />
      </Field>
      <FormError state={state} />
      <SubmitButton size="lg">إضافة</SubmitButton>
    </form>
  );
}
