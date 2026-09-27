"use client";

import { useActionState, useMemo, useState } from "react";
import { createBatchAction } from "@/server/actions/inventory";
import type { ActionState } from "@/server/actions/run";
import { Field, Input, Select } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

interface Props {
  productId?: string;
  products: { id: string; name: string; category: string; buyRange: string | null; sellPrice: string }[];
  accounts: { id: string; name: string; code: string; balance: string }[];
}

const n = (v: string) => Number(v.replace(/,/g, "")) || 0;
const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BatchForm({ productId, products, accounts }: Props) {
  const [state, action] = useActionState<ActionState, FormData>(createBatchAction, {});
  const [pid, setPid] = useState(productId ?? products[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [extra, setExtra] = useState("");
  const [paidFull, setPaidFull] = useState(true);
  const product = products.find((p) => p.id === pid);
  const total = n(qty) * n(price) + n(extra);
  const unit = n(qty) > 0 ? total / n(qty) : 0;
  const groups = useMemo(() => {
    const m = new Map<string, typeof products>();
    for (const p of products) m.set(p.category, [...(m.get(p.category) ?? []), p]);
    return [...m.entries()];
  }, [products]);

  return (
    <form action={action} className="space-y-4">
      <Field label="المنتج" hint={product?.buyRange ? `نطاق الشراء التقديري: ${product.buyRange}` : undefined}>
        <Select name="productId" value={pid} onChange={(e) => setPid(e.target.value)}>
          {groups.map(([cat, list]) => (
            <optgroup key={cat} label={cat}>
              {list.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الكمية">
          <Input name="quantity" inputMode="numeric" required value={qty} onChange={(e) => setQty(e.target.value)} className="num" />
        </Field>
        <Field label="سعر شراء الوحدة">
          <Input name="unitPrice" inputMode="decimal" required value={price} onChange={(e) => setPrice(e.target.value)} className="num" />
        </Field>
      </div>
      <Field label="شحن وجمارك وتكاليف إضافية (على الدفعة كلها)">
        <Input name="extraCosts" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0" className="num" />
      </Field>
      <div className="rounded-xl bg-subtle p-3 text-sm">
        الإجمالي <span className="num font-bold">{fmt(total)}</span> · تكلفة الوحدة الفعلية <span className="num font-bold">{fmt(unit)}</span>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="paidFull" value="1" checked={paidFull} onChange={(e) => setPaidFull(e.target.checked)} className="size-5" />
        مدفوع بالكامل
      </label>
      {!paidFull && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="المدفوع الآن" hint="الباقي يتسجل التزام للمورد">
            <Input name="paidAmount" inputMode="decimal" defaultValue="0" className="num" />
          </Field>
          <Field label="اسم المورد">
            <Input name="supplierName" required />
          </Field>
        </div>
      )}
      <Field label="الدفع من حساب">
        <Select name="paidFromId" defaultValue={accounts.find((a) => a.code === "BANK")?.id}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.balance})</option>
          ))}
        </Select>
      </Field>
      {paidFull && (
        <Field label="المورد (اختياري)">
          <Input name="supplierName" />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="سعر البيع المقترح" hint="يتحفظ كسعر افتراضي">
          <Input name="sellPrice" inputMode="decimal" defaultValue={product?.sellPrice} key={pid} className="num" />
        </Field>
        <Field label="تاريخ الاستلام">
          <Input name="date" type="date" defaultValue={new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10)} />
        </Field>
      </div>
      <FormError state={state} />
      <SubmitButton size="lg">حفظ الدفعة</SubmitButton>
    </form>
  );
}
