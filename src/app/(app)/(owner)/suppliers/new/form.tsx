"use client";

import { useActionState } from "react";
import { createSupplierAction } from "@/server/actions/suppliers";
import type { ActionState } from "@/server/actions/run";
import { SupplierFields } from "@/components/supplier-fields";
import { FormError, SubmitButton } from "@/components/form-status";

export function NewSupplierForm() {
  const [state, action] = useActionState<ActionState, FormData>(createSupplierAction, {});
  return (
    <form action={action} className="space-y-4">
      <SupplierFields />
      <FormError state={state} />
      <SubmitButton size="lg">إضافة</SubmitButton>
    </form>
  );
}
