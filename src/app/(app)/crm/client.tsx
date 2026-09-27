"use client";

import { useActionState, useRef, useState } from "react";
import { followUpAction, logActivityAction, moveDealAction } from "@/server/actions/crm";
import type { ActionState } from "@/server/actions/run";
import { Input, Select } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

const STAGES = [
  ["LEAD", "عميل محتمل"],
  ["CONTACTED", "تم التواصل"],
  ["INTERESTED", "مهتم"],
  ["QUOTE_SENT", "عرض سعر مرسل"],
  ["NEGOTIATION", "تفاوض"],
  ["DEPOSIT", "عربون مستلم"],
  ["WON", "تم التسليم والتحصيل"],
  ["LOST", "خسرناه"],
] as const;

const todayPlus = (days: number) => new Date(Date.now() + 3 * 3600000 + days * 86400000).toISOString().slice(0, 10);

/** +1 تواصل بضغطة (بدون عميل محدد) — للعدّاد اليومي */
export function LogButtons({ customerId, dealId }: { customerId?: string; dealId?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(logActivityAction, {});
  const btn = (type: string, label: string, count = 1) => (
    <form action={action}>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="count" value={count} />
      {customerId && <input type="hidden" name="customerId" value={customerId} />}
      {dealId && <input type="hidden" name="dealId" value={dealId} />}
      <SubmitButton size="sm" variant="secondary" pendingText="…" className="w-full">{label}</SubmitButton>
    </form>
  );
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1.5">
        {btn("call", "+1 مكالمة")}
        {btn("whatsapp", "+1 واتساب")}
        {btn("dm", "+1 رسالة")}
        {btn("dm", "+5", 5)}
      </div>
      {state.ok && state.message && <p className="text-center text-xs text-ok">{state.message}</p>}
      <FormError state={state} />
    </div>
  );
}

export function FollowUpForm({ id }: { id: string }) {
  const [state, action] = useActionState<ActionState, FormData>(followUpAction, {});
  return (
    <form action={action} className="mt-2 grid grid-cols-[1fr_auto_auto] items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="followUp" type="date" defaultValue={todayPlus(3)} className="h-10 text-sm" aria-label="المتابعة الجاية" />
      <SubmitButton size="sm" name="done" value="1" pendingText="…">تواصلت ✓</SubmitButton>
      <SubmitButton size="sm" variant="ghost" pendingText="…">أجّل</SubmitButton>
      <div className="col-span-3">
        <FormError state={state} />
      </div>
    </form>
  );
}

export function DealStageForm({ id, stage }: { id: string; stage: string }) {
  const [state, action] = useActionState<ActionState, FormData>(moveDealAction, {});
  const [value, setValue] = useState(stage);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="mt-2 space-y-1.5">
      <input type="hidden" name="id" value={id} />
      <Select
        name="stage"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (e.target.value !== "LOST") setTimeout(() => formRef.current?.requestSubmit(), 0);
        }}
        className="h-9 text-sm"
        aria-label="مرحلة الصفقة"
      >
        {STAGES.map(([k, l]) => (
          <option key={k} value={k}>{l}</option>
        ))}
      </Select>
      {value === "LOST" && stage !== "LOST" && (
        <div className="flex gap-1.5">
          <Input name="lostReason" required placeholder="ليش خسرناه؟" className="h-9 text-sm" />
          <SubmitButton size="sm" variant="danger">تأكيد</SubmitButton>
        </div>
      )}
      <FormError state={state} />
    </form>
  );
}
