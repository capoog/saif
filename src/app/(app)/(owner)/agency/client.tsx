"use client";

import { useActionState, useState } from "react";
import { chargeSubscriptionAction, createSubscriptionAction, createTaskAction, ownerTaskAction, payFreelancerAction, saveFreelancerAction, subscriptionStatusAction } from "@/server/actions/agency";
import type { ActionState } from "@/server/actions/run";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";
import { OverrideField } from "@/components/override";

type Acc = { id: string; name: string; code: string };
const today = (plus = 0) => new Date(Date.now() + 3 * 3600000 + plus * 86400000).toISOString().slice(0, 10);
const Ok = ({ s }: { s: ActionState }) => (s.ok && s.message ? <p className="text-xs text-ok">{s.message}</p> : null);

export function ChargeButton({ id, accounts }: { id: string; accounts: Acc[] }) {
  const [state, action] = useActionState<ActionState, FormData>(chargeSubscriptionAction, {});
  const [paid, setPaid] = useState(true);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" name="paid" value="1" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-4" /> دفع
      </label>
      {paid && (
        <Select name="accountId" defaultValue={accounts.find((a) => a.code === "BANK")?.id} className="h-9 w-32 text-xs">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      )}
      <SubmitButton size="sm" pendingText="…">سجّل الشهر</SubmitButton>
      <FormError state={state} />
    </form>
  );
}

export function SubscriptionControls({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState<ActionState, FormData>(subscriptionStatusAction, {});
  const btn = (s: string, label: string) => (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={s} />
      <SubmitButton size="sm" variant="ghost" pendingText="…">{label}</SubmitButton>
    </form>
  );
  return (
    <div className="flex flex-wrap gap-1">
      {status !== "ACTIVE" && btn("ACTIVE", "تفعيل")}
      {status === "ACTIVE" && btn("PAUSED", "إيقاف مؤقت")}
      {status !== "CANCELLED" && btn("CANCELLED", "إلغاء")}
      <FormError state={state} />
    </div>
  );
}

export function NewSubscription({ customers }: { customers: { id: string; name: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(createSubscriptionAction, {});
  return (
    <form action={action} className="space-y-3">
      <Field label="العميل">
        <Select name="customerId">
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="الخدمة">
          <Input name="service" required placeholder="إدارة سوشيال" list="agency-services" />
          <datalist id="agency-services">
            <option value="إدارة سوشيال" />
            <option value="تصميم" />
            <option value="مونتاج فيديو" />
            <option value="موقع وصيانة" />
            <option value="إعلانات ممولة" />
          </datalist>
        </Field>
        <Field label="القيمة الشهرية">
          <Input name="amount" inputMode="decimal" required className="num" />
        </Field>
      </div>
      <Field label="أول تحصيل" hint="التجديد كل شهر في نفس اليوم">
        <Input name="startDate" type="date" defaultValue={today()} />
      </Field>
      <FormError state={state} />
      <Ok s={state} />
      <SubmitButton>إضافة</SubmitButton>
    </form>
  );
}

export function NewTask({ customers, freelancers, subs }: { customers: { id: string; name: string }[]; freelancers: { id: string; name: string }[]; subs: { id: string; label: string; customerId: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(createTaskAction, {});
  const [customerId, setCustomerId] = useState(subs[0]?.customerId ?? customers[0]?.id ?? "");
  return (
    <form action={action} className="space-y-3">
      <Field label="العميل">
        <Select name="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>
      <input type="hidden" name="subscriptionId" value={subs.find((x) => x.customerId === customerId)?.id ?? ""} />
      <Field label="المهمة">
        <Input name="title" required placeholder="10 تصاميم الأسبوع" />
      </Field>
      <Textarea name="description" rows={2} placeholder="التفاصيل (اختياري)" />
      <div className="grid grid-cols-3 gap-2">
        <Field label="المستقل">
          <Select name="freelancerId" defaultValue="">
            <option value="">أنا</option>
            {freelancers.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="التكلفة">
          <Input name="cost" inputMode="decimal" className="num" />
        </Field>
        <Field label="التسليم">
          <Input name="dueAt" type="date" defaultValue={today(3)} />
        </Field>
      </div>
      <FormError state={state} />
      <Ok s={state} />
      <SubmitButton>إضافة</SubmitButton>
    </form>
  );
}

export function OwnerTaskButtons({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState<ActionState, FormData>(ownerTaskAction, {});
  const btn = (to: string, label: string, variant: "primary" | "secondary" | "ghost" = "ghost") => (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <SubmitButton size="sm" variant={variant} pendingText="…">{label}</SubmitButton>
    </form>
  );
  return (
    <div className="flex flex-wrap gap-1">
      {btn("APPROVED", status === "DELIVERED" ? "اعتماد التسليم ✓" : "خلصت ✓", status === "DELIVERED" ? "primary" : "secondary")}
      {status === "TODO" && btn("IN_PROGRESS", "بدأت")}
      {btn("CANCELLED", "إلغاء")}
      <FormError state={state} />
    </div>
  );
}

export function PayFreelancer({ freelancerId, due, accounts }: { freelancerId: string; due: string; accounts: Acc[] }) {
  const [state, action] = useActionState<ActionState, FormData>(payFreelancerAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="freelancerId" value={freelancerId} />
      <Input name="amount" defaultValue={due} inputMode="decimal" className="num h-9 w-28" />
      <Select name="accountId" defaultValue={accounts.find((a) => a.code === "BANK")?.id} className="h-9 w-36 text-sm">
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </Select>
      <SubmitButton size="sm" pendingText="…">سداد</SubmitButton>
      <OverrideField state={state} />
      <FormError state={state} />
      <Ok s={state} />
    </form>
  );
}

export function FreelancerForm() {
  const [state, action] = useActionState<ActionState, FormData>(saveFreelancerAction, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Input name="name" required placeholder="الاسم" />
        <Input name="phone" inputMode="tel" placeholder="الجوال" dir="ltr" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input name="skills" placeholder="المهارات: تصميم، مونتاج…" />
        <Input name="rateNote" placeholder="سعره: 50 للتصميم…" />
      </div>
      <FormError state={state} />
      <Ok s={state} />
      <SubmitButton variant="secondary">إضافة</SubmitButton>
    </form>
  );
}
