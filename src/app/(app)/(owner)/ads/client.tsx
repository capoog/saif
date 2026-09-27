"use client";

import { useActionState, useEffect, useRef } from "react";
import { addSpendAction, createCampaignAction, toggleCampaignAction } from "@/server/actions/ads";
import type { ActionState } from "@/server/actions/run";
import { Field, Input, Select } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";
import { OverrideField } from "@/components/override";
import { resetForm } from "@/components/form-reset-guard";

export function SpendForm({ campaignId, accounts }: { campaignId: string; accounts: { id: string; name: string; code: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(addSpendAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) resetForm(ref.current);
  }, [state]);
  return (
    <form ref={ref} action={action} className="mt-3 space-y-2 border-t border-border pt-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="grid grid-cols-3 gap-2">
        <Input name="amount" inputMode="decimal" placeholder="الإنفاق" required className="num h-10" />
        <Input name="orders" inputMode="numeric" placeholder="طلبات" className="num h-10" />
        <Input name="revenue" inputMode="decimal" placeholder="الإيراد" className="num h-10" />
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <Select name="accountId" defaultValue={accounts.find((a) => a.code === "BANK")?.id} className="h-10 text-sm">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <Input name="date" type="date" defaultValue={new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10)} className="h-10 text-sm" />
        <SubmitButton size="sm" pendingText="…">+ إنفاق</SubmitButton>
      </div>
      <OverrideField state={state} />
      <FormError state={state} />
      {state.ok && <p className="text-xs text-ok">{state.message}</p>}
    </form>
  );
}

export function ToggleCampaign({ id, active }: { id: string; active: boolean }) {
  const [, action] = useActionState<ActionState, FormData>(toggleCampaignAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <SubmitButton size="sm" variant="ghost" pendingText="…">{active ? "إيقاف" : "تشغيل"}</SubmitButton>
    </form>
  );
}

export function NewCampaign({ channels, products, engines }: { channels: string[]; products: { id: string; name: string }[]; engines: { id: string; name: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(createCampaignAction, {});
  return (
    <form action={action} className="space-y-3">
      <Field label="الاسم">
        <Input name="name" required placeholder="سناب — معطرات سيارات" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="القناة">
          <Select name="channel">
            {channels.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="المنتج">
          <Select name="productId" defaultValue="">
            <option value="">بدون (عام)</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="المحرك" hint="لو اخترت منتج، بيتاخد محركه تلقائيًا">
        <Select name="engineId" defaultValue="">
          <option value="">تلقائي</option>
          {engines.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </Select>
      </Field>
      <FormError state={state} />
      {state.ok && <p className="text-sm text-ok">{state.message}</p>}
      <SubmitButton variant="secondary">إضافة</SubmitButton>
    </form>
  );
}
