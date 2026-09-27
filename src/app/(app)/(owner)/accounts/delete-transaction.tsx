"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteTransactionAction } from "@/server/actions/accounts";
import type { ActionState } from "@/server/actions/run";
import { Input } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

export function DeleteTransaction({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(deleteTransactionAction, {});
  if (!open)
    return (
      <button aria-label="إلغاء الحركة" onClick={() => setOpen(true)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-subtle">
        <Trash2 className="size-4" />
      </button>
    );
  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <Input name="reason" placeholder="سبب الإلغاء" required className="h-9 w-32 text-sm" />
      <SubmitButton size="sm" variant="danger" pendingText="…">إلغاء</SubmitButton>
      <FormError state={state} />
    </form>
  );
}
