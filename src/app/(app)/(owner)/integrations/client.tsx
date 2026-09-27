"use client";

import { useActionState, useState } from "react";
import { mapSkuAction, retryExternalAction } from "@/server/actions/integrations";
import type { ActionState } from "@/server/actions/run";
import { Button, Input, Select } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

export function CopyField({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-2 flex gap-2">
      <Input readOnly value={value} dir="ltr" className="h-9 text-xs" onFocus={(e) => e.currentTarget.select()} />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setDone(true);
          } catch {}
        }}
      >
        {done ? "انسخ ✓" : "نسخ"}
      </Button>
    </div>
  );
}

export function MapSkuForm({ sku, products }: { sku: string; products: { id: string; label: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(mapSkuAction, {});
  return (
    <form action={action} className="space-y-1 rounded-xl bg-subtle p-2">
      <div className="text-xs">
        رمز المتجر: <code dir="ltr" className="font-semibold">{sku}</code>
      </div>
      <input type="hidden" name="sku" value={sku} />
      <div className="flex gap-2">
        <Select name="productId" defaultValue="" className="h-9 flex-1 text-sm">
          <option value="" disabled>
            اختر المنتج المقابل…
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </Select>
        <SubmitButton size="sm">ربط</SubmitButton>
      </div>
      <FormError state={state} />
      {state.ok && <p className="text-xs text-ok">{state.message}</p>}
    </form>
  );
}

export function RetryButton({ id }: { id: string }) {
  const [state, action] = useActionState<ActionState, FormData>(retryExternalAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" variant="secondary">أعد المحاولة</SubmitButton>
      <FormError state={state} />
      {state.ok && <p className="text-xs text-ok">{state.message}</p>}
    </form>
  );
}
