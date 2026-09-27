"use client";

import { useActionState, useState } from "react";
import { Download, Printer } from "lucide-react";
import { updateDecisionAction } from "@/server/actions/close";
import type { ActionState } from "@/server/actions/run";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

export function ExportButtons({ week }: { week: number }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="no-print flex gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const { toPng } = await import("html-to-image");
            const node = document.getElementById("snapshot")!;
            const bg = getComputedStyle(document.body).backgroundColor;
            const url = await toPng(node, { pixelRatio: 3, backgroundColor: bg });
            const a = document.createElement("a");
            a.href = url;
            a.download = `كشف-رأس-المال-أسبوع-${week}.png`;
            a.click();
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download className="size-4" /> {busy ? "جاري…" : "حفظ صورة"}
      </Button>
      <Button variant="secondary" size="sm" onClick={() => window.print()}>
        <Printer className="size-4" /> PDF / طباعة
      </Button>
    </div>
  );
}

export function DecisionEdit({ week, decision }: { week: number; decision: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateDecisionAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="week" value={week} />
      <Textarea name="decision" defaultValue={decision} />
      <Field label="سبب التعديل">
        <Input name="reason" required />
      </Field>
      <FormError state={state} />
      {state.ok && <p className="text-sm text-ok">{state.message}</p>}
      <SubmitButton variant="secondary" size="sm">حفظ</SubmitButton>
    </form>
  );
}
