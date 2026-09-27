"use client";

import { useActionState } from "react";
import { freelancerTaskAction } from "@/server/actions/agency";
import type { ActionState } from "@/server/actions/run";
import { Input } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

export function FreelancerTask({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState<ActionState, FormData>(freelancerTaskAction, {});
  return (
    <div className="space-y-2">
      {status === "TODO" && (
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="to" value="IN_PROGRESS" />
          <SubmitButton size="sm" variant="secondary">بدأت</SubmitButton>
        </form>
      )}
      <form action={action} className="space-y-2 rounded-xl bg-subtle p-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="to" value="DELIVERED" />
        <Input name="url" placeholder="رابط الشغل (درايف، فيقما…)" dir="ltr" className="h-10" />
        <Input name="note" placeholder="ملاحظة (اختياري)" className="h-10" />
        <SubmitButton size="sm">سلّمت ✓</SubmitButton>
      </form>
      <FormError state={state} />
    </div>
  );
}
