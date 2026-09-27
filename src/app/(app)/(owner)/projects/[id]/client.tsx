"use client";

import { useActionState, useState } from "react";
import { invoiceAction, projectMoneyAction, saveProjectAction } from "@/server/actions/projects";
import type { ActionState } from "@/server/actions/run";
import { ProjectFields } from "@/components/project-fields";
import { Field, Input, Select, cn } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";
import { OverrideField } from "@/components/override";

type Acc = { id: string; name: string; code: string };
const Ok = ({ s }: { s: ActionState }) => (s.ok && s.message ? <p className="text-xs text-ok">{s.message}</p> : null);
const AccountSelect = ({ accounts }: { accounts: Acc[] }) => (
  <Select name="accountId" defaultValue={accounts.find((a) => a.code === "BANK")?.id}>
    {accounts.map((a) => (
      <option key={a.id} value={a.id}>{a.name}</option>
    ))}
  </Select>
);

export function NewInvoice({ id }: { id: string }) {
  const [state, action] = useActionState<ActionState, FormData>(invoiceAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="create" />
      <Field label="مستخلص جديد — قيمة الأعمال (بدون ضريبة)" className="min-w-40 flex-1">
        <Input name="amount" inputMode="decimal" required className="num" />
      </Field>
      <SubmitButton size="md" variant="secondary">إضافة</SubmitButton>
      <div className="w-full">
        <FormError state={state} />
        <Ok s={state} />
      </div>
    </form>
  );
}

export function InvoiceActions({ invoiceId, status, net, accounts }: { invoiceId: string; status: string; net: string; accounts: Acc[] }) {
  const [state, action] = useActionState<ActionState, FormData>(invoiceAction, {});
  return (
    <div className="space-y-1">
      {status === "DRAFT" && (
        <form action={action}>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="op" value="SUBMITTED" />
          <SubmitButton size="sm" variant="secondary">قدّمته للجهة</SubmitButton>
        </form>
      )}
      {(status === "DRAFT" || status === "SUBMITTED") && (
        <form action={action}>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="op" value="APPROVED" />
          <SubmitButton size="sm">انعتمد ✓ (إيراد)</SubmitButton>
        </form>
      )}
      {status === "APPROVED" && (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="op" value="collect" />
          <Input name="amount" defaultValue={net} inputMode="decimal" className="num h-9 w-28" />
          <div className="w-36">
            <AccountSelect accounts={accounts} />
          </div>
          <SubmitButton size="sm">تحصّل ✓</SubmitButton>
        </form>
      )}
      <FormError state={state} />
    </div>
  );
}

export function ProjectMoney({ id, accounts, advanceLeft, guarantee, categories }: { id: string; accounts: Acc[]; advanceLeft: string; guarantee: { amount: string; held: string }; categories: { code: string; label: string }[] }) {
  const [kind, setKind] = useState<"advance" | "guarantee" | "cost">(Number(advanceLeft) > 0 ? "advance" : "cost");
  const [state, action] = useActionState<ActionState, FormData>(projectMoneyAction, {});
  const defaults = { advance: advanceLeft, guarantee: (Number(guarantee.amount) * 0.1).toFixed(2), cost: "" };
  return (
    <form action={action} className="space-y-3" key={kind}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-subtle p-1">
        {(
          [
            ["advance", "استلام مقدمة"],
            ["cost", "مصروف"],
            ["guarantee", "هامش الضمان"],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setKind(v)} className={cn("h-10 rounded-lg text-sm font-semibold", kind === v ? "bg-card shadow" : "text-muted")}>
            {l}
          </button>
        ))}
      </div>
      {kind === "guarantee" && (
        <p className="text-xs text-muted">
          الضمان <span className="num">{Number(guarantee.amount).toLocaleString("en-US")}</span> · المحجوز حاليًا <span className="num">{Number(guarantee.held).toLocaleString("en-US")}</span>. اكتب المبلغ المحجوز الجديد (صفر = فك الحجز). المحجوز من رأس المال لكن مو من السيولة.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label={kind === "guarantee" ? "المحجوز من البنك" : "المبلغ"}>
          <Input name="amount" inputMode="decimal" defaultValue={defaults[kind]} required className="num" />
        </Field>
        <Field label="الحساب">
          <AccountSelect accounts={accounts} />
        </Field>
      </div>
      {kind === "cost" && (
        <div className="grid grid-cols-2 gap-2">
          <Select name="category" defaultValue="EXP_OTHER">
            {categories.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </Select>
          <Input name="note" placeholder="مواد، عمالة، نقل…" />
        </div>
      )}
      <OverrideField state={state} />
      <FormError state={state} />
      <Ok s={state} />
      <SubmitButton>تسجيل</SubmitButton>
    </form>
  );
}

export function EditProject({ id, p }: { id: string; p: Parameters<typeof ProjectFields>[0]["p"] }) {
  const [state, action] = useActionState<ActionState, FormData>(saveProjectAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <ProjectFields p={p} customers={[]} withStatus />
      <FormError state={state} />
      <Ok s={state} />
      <SubmitButton variant="secondary">حفظ</SubmitButton>
    </form>
  );
}
