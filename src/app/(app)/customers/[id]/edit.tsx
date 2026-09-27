"use client";

import { useActionState } from "react";
import { updateCustomerAction } from "@/server/actions/crm";
import type { ActionState } from "@/server/actions/run";
import { CustomerFields } from "@/components/customer-fields";
import { FormError, SubmitButton } from "@/components/form-status";

type C = { id: string; name: string; type: string; phone: string | null; email: string | null; city: string | null; sector: string | null; contact: string | null; channel: string | null; notes: string | null };

export function EditCustomer({ c }: { c: C }) {
  const [state, action] = useActionState<ActionState, FormData>(updateCustomerAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={c.id} />
      <CustomerFields c={c} />
      <FormError state={state} />
      {state.ok && <p className="text-sm text-ok">{state.message}</p>}
      <SubmitButton variant="secondary">حفظ</SubmitButton>
    </form>
  );
}
