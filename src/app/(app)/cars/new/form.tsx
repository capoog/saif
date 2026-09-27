"use client";

import { useActionState, useState } from "react";
import { createCarAction } from "@/server/actions/cars";
import type { ActionState } from "@/server/actions/run";
import { CarFields } from "@/components/car-fields";
import { cn } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

export function NewCarForm() {
  const [state, action] = useActionState<ActionState, FormData>(createCarAction, {});
  const [type, setType] = useState<"BROKERAGE" | "PURCHASE">("BROKERAGE");
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="type" value={type} />
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-subtle p-1">
        {(
          [
            ["BROKERAGE", "وساطة (سيارة غيري)"],
            ["PURCHASE", "شراء وبيع (سيارتي)"],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setType(v)} className={cn("h-11 rounded-lg text-sm font-semibold", type === v ? "bg-card shadow" : "text-muted")}>
            {l}
          </button>
        ))}
      </div>
      <CarFields type={type} />
      <FormError state={state} />
      <SubmitButton size="lg">حفظ السيارة</SubmitButton>
    </form>
  );
}
