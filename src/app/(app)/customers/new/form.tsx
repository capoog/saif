"use client";

import { useActionState } from "react";
import { createCustomerAction } from "@/server/actions/crm";
import type { ActionState } from "@/server/actions/run";
import { CustomerFields } from "@/components/customer-fields";
import { FormError, SubmitButton } from "@/components/form-status";

export function NewCustomerForm({ next }: { next?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(createCustomerAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <CustomerFields />
      <FormError state={state} />
      <SubmitButton size="lg">إضافة</SubmitButton>
    </form>
  );
}
