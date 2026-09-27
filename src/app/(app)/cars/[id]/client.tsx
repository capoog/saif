"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { buyCarAction, cancelCarAction, carCostAction, carQuoteAction, checklistAction, sellCarAction, updateCarAction } from "@/server/actions/cars";
import type { ActionState } from "@/server/actions/run";
import { CarFields, type CarFormValues } from "@/components/car-fields";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";
import { OverrideField } from "@/components/override";

type Acc = { id: string; name: string; code: string; balance: string };
type Cust = { id: string; name: string; phone: string | null };
const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);

function Ok({ s }: { s: ActionState }) {
  return s.ok && s.message ? <p className="text-sm text-ok">{s.message}</p> : null;
}

function AccountSelect({ accounts }: { accounts: Acc[] }) {
  return (
    <Select name="accountId" defaultValue={accounts.find((a) => a.code === "BANK")?.id}>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} ({a.balance})
        </option>
      ))}
    </Select>
  );
}

export function CarQuote({ id, price, customers }: { id: string; price: string; customers: Cust[] }) {
  const [state, action] = useActionState<ActionState, FormData>(carQuoteAction, {});
  if (customers.length === 0)
    return (
      <p className="text-sm">
        أضف العميل الأول: <Link href="/customers/new" className="text-primary">+ عميل</Link>
      </p>
    );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <Field label="العميل" hint={<Link href="/customers/new" className="text-primary">+ عميل جديد</Link>}>
        <Select name="customerId">
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.phone ? ` — ${c.phone}` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="السعر">
          <Input name="price" inputMode="decimal" defaultValue={price} required className="num" />
        </Field>
        <Field label="صالح (أيام)">
          <Input name="validityDays" inputMode="numeric" defaultValue="3" className="num" />
        </Field>
      </div>
      <Field label="شروط (اختياري)">
        <Textarea name="terms" rows={2} placeholder="السعر شامل نقل الملكية…" />
      </Field>
      <FormError state={state} />
      <SubmitButton size="lg">اصنع عرض السعر ← PDF</SubmitButton>
    </form>
  );
}

export function Checklist({ id, items }: { id: string; items: { key: string; label: string; done: boolean }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(checklistAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="text-sm font-medium">قائمة الفحص</div>
      {items.map((i) => (
        <label key={i.key} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={i.key} defaultChecked={i.done} className="size-5" /> {i.label}
        </label>
      ))}
      <FormError state={state} />
      <Ok s={state} />
      <SubmitButton size="sm" variant="secondary">حفظ الفحص</SubmitButton>
    </form>
  );
}

export function BuyCar({ id, accounts, limitNote }: { id: string; accounts: Acc[]; limitNote: string }) {
  const [state, action] = useActionState<ActionState, FormData>(buyCarAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="سعر الشراء" hint={limitNote}>
          <Input name="price" inputMode="decimal" required className="num" />
        </Field>
        <Field label="من حساب">
          <AccountSelect accounts={accounts} />
        </Field>
      </div>
      <Field label="التاريخ">
        <Input name="date" type="date" defaultValue={today()} />
      </Field>
      <OverrideField state={state} />
      <FormError state={state} />
      <Ok s={state} />
      <SubmitButton>اشتريتها ✓</SubmitButton>
    </form>
  );
}

export function CarCost({ id, accounts }: { id: string; accounts: Acc[] }) {
  const [state, action] = useActionState<ActionState, FormData>(carCostAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <Input name="description" placeholder="تلميع، فحص، إصلاح…" required />
        <Input name="amount" inputMode="decimal" placeholder="المبلغ" required className="num" />
      </div>
      <AccountSelect accounts={accounts} />
      <OverrideField state={state} />
      <FormError state={state} />
      <Ok s={state} />
      <SubmitButton size="sm" variant="secondary">+ تكلفة تجهيز</SubmitButton>
    </form>
  );
}

export function SellCar({ id, price, accounts, customers, brokerage }: { id: string; price: string; accounts: Acc[]; customers: Cust[]; brokerage: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(sellCarAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="سعر البيع">
          <Input name="price" inputMode="decimal" defaultValue={price} required className="num" />
        </Field>
        <Field label={brokerage ? "العمولة تنزل في" : "الفلوس تنزل في"}>
          <AccountSelect accounts={accounts} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="المشتري (اختياري)">
          <Select name="buyerId" defaultValue="">
            <option value="">—</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="التاريخ">
          <Input name="date" type="date" defaultValue={today()} />
        </Field>
      </div>
      {brokerage && <p className="text-xs text-muted">في الوساطة العمولة بس هي دخلك. فلوس السيارة تروح لصاحبها وما تدخل حساباتك.</p>}
      <FormError state={state} />
      <Ok s={state} />
      <SubmitButton>{brokerage ? "انباعت ✓ سجّل العمولة" : "انباعت ✓"}</SubmitButton>
    </form>
  );
}

export function EditCar({ id, type, values }: { id: string; type: "BROKERAGE" | "PURCHASE"; values: CarFormValues }) {
  const [state, action] = useActionState<ActionState, FormData>(updateCarAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <CarFields c={values} type={type} />
      <FormError state={state} />
      <Ok s={state} />
      <SubmitButton variant="secondary">حفظ</SubmitButton>
    </form>
  );
}

export function CancelCar({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(cancelCarAction, {});
  if (!open)
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        إلغاء الصفقة
      </Button>
    );
  return (
    <form action={action} className="flex gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="reason" required placeholder="السبب" className="h-10" />
      <SubmitButton variant="danger" size="sm">تأكيد</SubmitButton>
      <FormError state={state} />
    </form>
  );
}
