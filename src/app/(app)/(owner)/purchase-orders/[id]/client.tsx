"use client";

import { useActionState } from "react";
import { cancelPurchaseOrderAction, receivePurchaseOrderAction } from "@/server/actions/suppliers";
import type { ActionState } from "@/server/actions/run";
import { Field, Input, Select } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";
import { OverrideField } from "@/components/override";

export function ReceivePO({ id, total, accounts }: { id: string; total: string; accounts: { id: string; name: string; code: string; balance: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(receivePurchaseOrderAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="المدفوع الآن" hint="الباقي يتسجل مستحق للمورد">
          <Input name="paidNow" inputMode="decimal" defaultValue={total} className="num" />
        </Field>
        <Field label="من حساب">
          <Select name="paidFromId" defaultValue={accounts.find((a) => a.code === "BANK")?.id}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.balance})</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="تاريخ الاستلام">
        <Input name="date" type="date" defaultValue={new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10)} />
      </Field>
      <OverrideField state={state} />
      <FormError state={state} />
      {state.ok && <p className="text-sm text-ok">{state.message}</p>}
      <SubmitButton size="lg">استلمت البضاعة ✓</SubmitButton>
    </form>
  );
}

export function CancelPO({ id }: { id: string }) {
  const [state, action] = useActionState<ActionState, FormData>(cancelPurchaseOrderAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <FormError state={state} />
      <SubmitButton variant="ghost" size="sm">إلغاء الأمر</SubmitButton>
    </form>
  );
}
