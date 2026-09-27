"use client";

import { useActionState } from "react";
import { paySupplierAction, updateSupplierAction } from "@/server/actions/suppliers";
import type { ActionState } from "@/server/actions/run";
import { SupplierFields } from "@/components/supplier-fields";
import { Field, Input, Select } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";
import { OverrideField } from "@/components/override";

export function PaySupplier({ supplierId, due, accounts }: { supplierId: string; due: string; accounts: { id: string; name: string; code: string; balance: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(paySupplierAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="supplierId" value={supplierId} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="المبلغ">
          <Input name="amount" inputMode="decimal" defaultValue={due} className="num" />
        </Field>
        <Field label="من حساب">
          <Select name="accountId" defaultValue={accounts.find((a) => a.code === "BANK")?.id}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.balance})</option>
            ))}
          </Select>
        </Field>
      </div>
      <OverrideField state={state} />
      <FormError state={state} />
      {state.ok && <p className="text-sm text-ok">{state.message}</p>}
      <SubmitButton>سداد</SubmitButton>
    </form>
  );
}

type S = { id: string; name: string; type: string; phone: string | null; contact: string | null; city: string | null; rating: number | null; notes: string | null };

export function EditSupplier({ s }: { s: S }) {
  const [state, action] = useActionState<ActionState, FormData>(updateSupplierAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={s.id} />
      <SupplierFields s={s} />
      <FormError state={state} />
      {state.ok && <p className="text-sm text-ok">{state.message}</p>}
      <SubmitButton variant="secondary">حفظ</SubmitButton>
    </form>
  );
}
