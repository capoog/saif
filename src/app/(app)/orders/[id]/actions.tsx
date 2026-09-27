"use client";

import { useActionState, useState } from "react";
import { addPaymentAction, changeStatusAction, setInvoiceAction } from "@/server/actions/orders";
import type { ActionState } from "@/server/actions/run";
import { ORDER_STATUS } from "@/lib/labels";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

type Acc = { id: string; name: string; code: string };

export function StatusActions({ id, next, paid, accounts }: { id: string; next: string[]; paid: number; accounts: Acc[] }) {
  const [state, action] = useActionState<ActionState, FormData>(changeStatusAction, {});
  const [pending, setPending] = useState<string | null>(null);
  if (next.length === 0) return null;
  const needsRefund = (s: string) => (s === "RETURNED" || s === "CANCELLED") && paid > 0;

  return (
    <Card>
      <div className="flex flex-wrap gap-2">
        {next.map((s) =>
          needsRefund(s) || s === "RETURNED" || s === "CANCELLED" ? (
            <Button key={s} type="button" variant={s === "DELIVERED" ? "primary" : "secondary"} onClick={() => setPending(s)}>
              {ORDER_STATUS[s]}
            </Button>
          ) : (
            <form key={s} action={action}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="to" value={s} />
              <SubmitButton variant={s === "DELIVERED" ? "primary" : "secondary"}>← {ORDER_STATUS[s]}</SubmitButton>
            </form>
          ),
        )}
      </div>
      {pending && (
        <form action={action} className="mt-3 space-y-3 rounded-xl bg-subtle p-3">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="to" value={pending} />
          <p className="text-sm">
            {pending === "RETURNED" ? "المرتجع هيرجّع الكميات للمخزون ويعكس الإيراد." : "إلغاء الطلب."}
          </p>
          {paid > 0 && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="refund" value="1" defaultChecked className="size-5" /> رجّع للعميل <span className="num font-semibold">{paid.toFixed(2)}</span> دلوقتي
              </label>
              <Select name="refundAccountId" defaultValue={accounts.find((a) => a.code === "CASH_BOX")?.id}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>من {a.name}</option>
                ))}
              </Select>
            </>
          )}
          <div className="flex gap-2">
            <SubmitButton variant="danger">تأكيد {ORDER_STATUS[pending]}</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setPending(null)}>رجوع</Button>
          </div>
        </form>
      )}
      <div className="mt-2">
        <FormError state={state} />
      </div>
    </Card>
  );
}

export function PaymentForm({ id, due, methods, accounts }: { id: string; due: string; methods: { code: string; label: string; accountId: string }[]; accounts: Acc[] }) {
  const [state, action] = useActionState<ActionState, FormData>(addPaymentAction, {});
  const [accountId, setAccountId] = useState(methods[0].accountId);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="المبلغ">
          <Input name="amount" inputMode="decimal" defaultValue={due} className="num" />
        </Field>
        <Field label="الطريقة">
          <Select name="method" onChange={(e) => setAccountId(methods.find((m) => m.code === e.target.value)!.accountId)}>
            {methods.map((m) => (
              <option key={m.code} value={m.code}>{m.label}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="الحساب">
        <Select name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </Field>
      <FormError state={state} />
      <SubmitButton>تسجيل الدفعة</SubmitButton>
    </form>
  );
}

export function InvoiceForm({ id, no, url }: { id: string; no: string; url: string }) {
  const [state, action] = useActionState<ActionState, FormData>(setInvoiceAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-2">
        <Input name="no" placeholder="رقم الفاتورة" defaultValue={no} dir="ltr" />
        <Input name="url" placeholder="الرابط" defaultValue={url} dir="ltr" />
      </div>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="text-sm text-primary">فتح الفاتورة</a>
      )}
      <FormError state={state} />
      {state.ok && <p className="text-sm text-ok">{state.message}</p>}
      <SubmitButton variant="secondary" size="sm">حفظ</SubmitButton>
    </form>
  );
}
