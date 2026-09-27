"use client";

import { useActionState, useState } from "react";
import { cancelContractAction, contractPaymentAction } from "@/server/actions/quotes";
import type { ActionState } from "@/server/actions/run";
import { Button, Field, Input, Select } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

export function ContractPayment({ id, suggested, accounts }: { id: string; suggested: string; accounts: { id: string; name: string; code: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(contractPaymentAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="المبلغ">
          <Input name="amount" inputMode="decimal" defaultValue={suggested} className="num" />
        </Field>
        <Field label="الحساب">
          <Select name="accountId" defaultValue={accounts.find((a) => a.code === "BANK")?.id}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="text-xs text-muted">المبلغ بيتوزع على الدفعات المفتوحة. قبل التسليم = عربون (التزام)، بعد التسليم = تحصيل.</p>
      <FormError state={state} />
      {state.ok && <p className="text-sm text-ok">{state.message}</p>}
      <SubmitButton>تسجيل</SubmitButton>
    </form>
  );
}

export function CancelContract({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(cancelContractAction, {});
  if (!open)
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        إلغاء العقد
      </Button>
    );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Input name="reason" required placeholder="سبب الإلغاء" />
      <p className="text-xs text-muted">لو فيه عربون متحصّل، هيفضل التزام للعميل لحد ما ترجّعه من صفحة كل طلب.</p>
      <FormError state={state} />
      <SubmitButton variant="danger" size="sm">تأكيد الإلغاء</SubmitButton>
    </form>
  );
}
