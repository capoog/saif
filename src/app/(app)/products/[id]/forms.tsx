"use client";

import { useActionState } from "react";
import { adjustStockAction, updateProductAction } from "@/server/actions/inventory";
import type { ActionState } from "@/server/actions/run";
import { PRODUCT_STATUS } from "@/lib/labels";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

function Ok({ state }: { state: ActionState }) {
  return state.ok && state.message ? <div className="rounded-xl bg-ok-bg px-3 py-2 text-sm text-ok">{state.message}</div> : null;
}

export function ProductEditForm({ id, status, price, notes }: { id: string; status: string; price: string; notes: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateProductAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <Field label="الحالة">
        <Select name="status" defaultValue={status}>
          {Object.entries(PRODUCT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
      </Field>
      <Field label="سعر البيع الافتراضي" hint="بيتعبى تلقائيًا في الطلب الجديد">
        <Input name="defaultSellPrice" inputMode="decimal" defaultValue={price} className="num" />
      </Field>
      <Field label="ملاحظات">
        <Textarea name="notes" defaultValue={notes} />
      </Field>
      <FormError state={state} />
      <Ok state={state} />
      <SubmitButton>حفظ</SubmitButton>
    </form>
  );
}

export function StockCountForm({ productId, onHand }: { productId: string; onHand: string }) {
  const [state, action] = useActionState<ActionState, FormData>(adjustStockAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <p className="text-sm text-muted">
        الكمية في النظام: <span className="num font-semibold text-fg">{onHand}</span>. النقص بيتسجل مصروف «فروقات جرد» بتكلفة FIFO.
      </p>
      <Field label="الكمية الفعلية">
        <Input name="counted" inputMode="decimal" defaultValue={onHand} className="num" />
      </Field>
      <Field label="السبب">
        <Input name="note" placeholder="تالف، ضايع، عيّنة…" />
      </Field>
      <FormError state={state} />
      <Ok state={state} />
      <SubmitButton variant="secondary">تسجيل الجرد</SubmitButton>
    </form>
  );
}
