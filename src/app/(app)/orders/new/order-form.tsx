"use client";

import { useActionState, useEffect, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { createOrderAction } from "@/server/actions/orders";
import type { ActionState } from "@/server/actions/run";
import { Field, Input, Select, cn } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

interface Props {
  products: { id: string; name: string; price: string; available: number }[];
  channels: string[];
  methods: { code: string; label: string; accountId: string }[];
  accounts: { id: string; name: string }[];
  vat: { registered: boolean; ratePct: number; inclusive: boolean };
}

type Line = { productId: string; quantity: number; unitPrice: string };
const STATUSES = [
  { v: "DELIVERED", l: "مسلّم" },
  { v: "CONFIRMED", l: "مؤكد" },
  { v: "SHIPPED", l: "مشحون" },
  { v: "NEW", l: "جديد" },
] as const;
const PAY = [
  { v: "full", l: "مدفوع كامل" },
  { v: "partial", l: "عربون / جزئي" },
  { v: "none", l: "لم يُدفع" },
] as const;

const num = (v: string) => Number(v.replace(/,/g, "")) || 0;
const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Chips<T extends string>({ options, value, onChange }: { options: readonly { v: T; l: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} className={cn("rounded-full border px-3 py-2 text-sm", value === o.v ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border")}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function OrderForm({ products, channels, methods, accounts, vat }: Props) {
  const [state, action] = useActionState<ActionState, FormData>(createOrderAction, {});
  const first = products[0];
  const [channel, setChannel] = useState(channels[0]);
  const [lines, setLines] = useState<Line[]>([{ productId: first?.id ?? "", quantity: 1, unitPrice: first?.price ?? "" }]);
  const [status, setStatus] = useState<(typeof STATUSES)[number]["v"]>("DELIVERED");
  const [payMode, setPayMode] = useState<(typeof PAY)[number]["v"]>("full");
  const [method, setMethod] = useState(methods[0].code);
  const [accountId, setAccountId] = useState(methods[0].accountId);
  const [payAmount, setPayAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const [shipping, setShipping] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [more, setMore] = useState(false);

  // آخر قناة وطريقة دفع مستخدمة — أسرع للإدخال المتكرر
  useEffect(() => {
    try {
      const c = localStorage.getItem("order.channel");
      if (c && channels.includes(c)) setChannel(c);
      const m = methods.find((x) => x.code === localStorage.getItem("order.method"));
      if (m) {
        setMethod(m.code);
        setAccountId(m.accountId);
      }
    } catch {}
  }, [channels, methods]);

  const subtotal = lines.reduce((s, l) => s + l.quantity * num(l.unitPrice), 0);
  const base = subtotal - num(discount) + num(shipping);
  const rate = vat.registered ? vat.ratePct / 100 : 0;
  const vatAmount = rate === 0 ? 0 : vat.inclusive ? (base * rate) / (1 + rate) : base * rate;
  const total = vat.inclusive || rate === 0 ? base : base + vatAmount;

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setProduct = (i: number, id: string) => update(i, { productId: id, unitPrice: products.find((p) => p.id === id)?.price ?? "" });

  const payload = JSON.stringify({
    channel,
    status,
    items: lines,
    discount,
    shippingFee: shipping,
    // الدفع عند الاستلام = ذمة لحد ما الفلوس توصل فعلًا (تتسجل كدفعة من شاشة الطلب)
    payMode: method === "cod" ? "none" : payMode,
    payAmount,
    method,
    accountId,
    customerName,
    customerPhone,
  });

  return (
    <form
      action={(fd) => {
        try {
          localStorage.setItem("order.channel", channel);
          localStorage.setItem("order.method", method);
        } catch {}
        action(fd);
      }}
      className="space-y-4"
    >
      <input type="hidden" name="payload" value={payload} />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {channels.map((c) => (
          <button key={c} type="button" onClick={() => setChannel(c)} className={cn("shrink-0 rounded-full border px-3 py-2 text-sm", channel === c ? "border-primary bg-primary text-primary-fg" : "border-border")}>
            {c}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {lines.map((l, i) => {
          const p = products.find((x) => x.id === l.productId);
          return (
            <div key={i} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex gap-2">
                <Select value={l.productId} onChange={(e) => setProduct(i, e.target.value)} className="flex-1">
                  {products.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} {x.available > 0 ? `(${x.available})` : "— لا يوجد مخزون"}
                    </option>
                  ))}
                </Select>
                {lines.length > 1 && (
                  <button type="button" aria-label="حذف البند" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="grid size-12 place-items-center rounded-xl text-danger">
                    <Trash2 className="size-5" />
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="flex items-center rounded-xl border border-border">
                  <button type="button" aria-label="أقل" onClick={() => update(i, { quantity: Math.max(1, l.quantity - 1) })} className="grid size-12 place-items-center">
                    <Minus className="size-4" />
                  </button>
                  <input inputMode="numeric" value={l.quantity} onChange={(e) => update(i, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} className="num w-full bg-transparent text-center text-lg font-bold outline-none" />
                  <button type="button" aria-label="أكتر" onClick={() => update(i, { quantity: l.quantity + 1 })} className="grid size-12 place-items-center">
                    <Plus className="size-4" />
                  </button>
                </div>
                <Input inputMode="decimal" placeholder="سعر الوحدة" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} className="num text-lg" />
              </div>
              {p && status === "DELIVERED" && l.quantity > p.available && <p className="mt-1 text-xs text-danger">المتاح {p.available} بس — التسليم هيترفض.</p>}
            </div>
          );
        })}
        <button type="button" onClick={() => setLines((ls) => [...ls, { productId: first?.id ?? "", quantity: 1, unitPrice: first?.price ?? "" }])} className="w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted">
          + بند آخر
        </button>
      </div>

      <Field label="الحالة">
        <Chips options={STATUSES} value={status} onChange={setStatus} />
      </Field>

      <Field label="الدفع">
        <Chips options={PAY} value={payMode} onChange={setPayMode} />
      </Field>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {methods.map((m) => (
          <button
            key={m.code}
            type="button"
            onClick={() => {
              setMethod(m.code);
              setAccountId(m.accountId);
              if (m.code === "cod") setPayMode("none");
            }}
            className={cn("shrink-0 rounded-full border px-3 py-2 text-sm", method === m.code ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border")}
          >
            {m.label}
          </button>
        ))}
      </div>
      {method === "cod" && <p className="text-xs text-muted">الدفع عند الاستلام بيتسجل ذمة لحد ما تحصّل الفلوس من شركة الشحن.</p>}
      {payMode === "partial" && method !== "cod" && (
        <Field label="المبلغ المدفوع" hint="قبل التسليم = عربون (التزام، مش إيراد)">
          <Input inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="num" />
        </Field>
      )}

      <button type="button" onClick={() => setMore((m) => !m)} className="text-sm text-primary">
        {more ? "− إخفاء" : "+ العميل، الخصم، الشحن، حساب الاستلام"}
      </button>
      {more && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="اسم العميل" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <Input placeholder="الجوال" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} dir="ltr" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="خصم">
              <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="num" />
            </Field>
            <Field label="شحن على العميل">
              <Input inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} className="num" />
            </Field>
          </div>
          <Field label="حساب الاستلام">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <div className="rounded-2xl bg-subtle p-3 text-sm">
        <div className="flex justify-between">
          <span>الإجمالي</span>
          <span className="num text-lg font-bold">{fmt(total)}</span>
        </div>
        {rate > 0 && (
          <div className="flex justify-between text-muted">
            <span>منها ضريبة {vat.ratePct}% (مش إيراد)</span>
            <span className="num">{fmt(vatAmount)}</span>
          </div>
        )}
      </div>

      <FormError state={state} />
      <SubmitButton size="lg">حفظ الطلب</SubmitButton>
    </form>
  );
}
