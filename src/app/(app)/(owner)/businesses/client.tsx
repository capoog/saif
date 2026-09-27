"use client";

import { useActionState, useState } from "react";
import { createBusinessAction, updateBusinessAction } from "@/server/actions/businesses";
import type { ActionState } from "@/server/actions/run";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

type Kind = { k: string; label: string; hint: string };

function BusinessFields({ kinds, b }: { kinds: Kind[]; b?: { name: string; kind: string; maxCapitalPct: string; notes: string } }) {
  const [kind, setKind] = useState(b?.kind ?? "RESTAURANT");
  const hint = kinds.find((x) => x.k === kind)?.hint;
  return (
    <>
      <Field label="اسم النشاط">
        <Input name="name" required defaultValue={b?.name} placeholder="مثلًا: كافيه الحي" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="النوع" hint={hint}>
          {b?.kind === "CORE" ? (
            <>
              <input type="hidden" name="kind" value="CORE" />
              <Input value="أساسي" disabled />
            </>
          ) : (
            <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {kinds.map((x) => (
                <option key={x.k} value={x.k}>{x.label}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="أقصى نسبة من رأس المال %" hint="فاضي = بدون حد">
          <Input name="maxCapitalPct" inputMode="decimal" defaultValue={b?.maxCapitalPct} className="num" />
        </Field>
      </div>
      <Field label="ملاحظات">
        <Textarea name="notes" rows={2} defaultValue={b?.notes} />
      </Field>
    </>
  );
}

export function NewBusinessForm({ kinds }: { kinds: Kind[] }) {
  const [state, action] = useActionState<ActionState, FormData>(createBusinessAction, {});
  return (
    <form action={action} className="space-y-3">
      <BusinessFields kinds={kinds} />
      <FormError state={state} />
      <SubmitButton>إضافة النشاط</SubmitButton>
    </form>
  );
}

export function EditBusinessForm({ id, kinds, b }: { id: string; kinds: Kind[]; b: { name: string; kind: string; maxCapitalPct: string; notes: string } }) {
  const [state, action] = useActionState<ActionState, FormData>(updateBusinessAction, {});
  return (
    <form action={action} className="space-y-3" key={JSON.stringify(b)}>
      <input type="hidden" name="id" value={id} />
      <BusinessFields kinds={kinds} b={b} />
      <FormError state={state} />
      {state.ok && state.message && <p className="text-sm text-ok">{state.message}</p>}
      <SubmitButton variant="secondary">حفظ</SubmitButton>
    </form>
  );
}

export function ToggleBusiness({ id, active }: { id: string; active: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(updateBusinessAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="toggle" value={active ? "off" : "on"} />
      <SubmitButton size="sm" variant={active ? "secondary" : "primary"}>{active ? "إيقاف النشاط" : "تشغيل النشاط"}</SubmitButton>
      <FormError state={state} />
    </form>
  );
}
