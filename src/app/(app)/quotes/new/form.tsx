"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { createQuoteAction } from "@/server/actions/quotes";
import type { ActionState } from "@/server/actions/run";
import { Field, Input, Select, Textarea, cn } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

type P = { id: string; name: string; isBox: boolean; price: string; cost: string | null };
type Line = { productId: string; description: string; quantity: number; unitPrice: string };

const n = (v: string) => Number(v.replace(/,/g, "")) || 0;
const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function QuoteForm(p: {
  customerId?: string;
  dealId?: string;
  customers: { id: string; name: string }[];
  deals: { id: string; title: string; customerId: string }[];
  products: P[];
  defaults: { validityDays: number; depositPct: number; vatRegistered: boolean; vatRatePct: number; inclusive: boolean };
}) {
  const [state, action] = useActionState<ActionState, FormData>(createQuoteAction, {});
  const [customerId, setCustomerId] = useState(p.customerId ?? p.customers[0].id);
  const deals = p.deals.filter((d) => d.customerId === customerId);
  const [dealId, setDealId] = useState(p.dealId ?? deals[0]?.id ?? "");
  const first = p.products.find((x) => x.isBox) ?? p.products[0];
  const [lines, setLines] = useState<Line[]>([{ productId: first.id, description: first.name, quantity: 1, unitPrice: first.price }]);
  const [discount, setDiscount] = useState("");
  const [shipping, setShipping] = useState("");
  const [validityDays, setValidity] = useState(String(p.defaults.validityDays));
  const [depositPct, setDeposit] = useState(String(p.defaults.depositPct));
  const [terms, setTerms] = useState("التسليم خلال 10 أيام عمل من استلام العربون.\nالشعار يتم اعتماده قبل الطباعة.");

  const byId = new Map(p.products.map((x) => [x.id, x]));
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const subtotal = lines.reduce((s, l) => s + l.quantity * n(l.unitPrice), 0);
  const base = subtotal - n(discount) + n(shipping);
  const rate = p.defaults.vatRegistered ? p.defaults.vatRatePct / 100 : 0;
  const total = rate && !p.defaults.inclusive ? base * (1 + rate) : base;
  const net = rate ? (p.defaults.inclusive ? base / (1 + rate) : base) : base;
  const cost = lines.reduce((s, l) => s + (l.productId && byId.get(l.productId)?.cost ? Number(byId.get(l.productId)!.cost) * l.quantity : 0), 0);
  const unknownCost = lines.some((l) => !l.productId || !byId.get(l.productId)?.cost);
  const margin = net > 0 ? ((net - cost) / net) * 100 : 0;

  const payload = JSON.stringify({ customerId, dealId, items: lines.map((l) => ({ ...l, productId: l.productId || undefined })), discount, shippingFee: shipping, validityDays, depositPct, terms });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="العميل">
          <Select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setDealId(p.deals.find((d) => d.customerId === e.target.value)?.id ?? ""); }}>
            {p.customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="الصفقة">
          <Select value={dealId} onChange={(e) => setDealId(e.target.value)}>
            <option value="">بدون</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>{d.title}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="space-y-2">
        {lines.map((l, i) => {
          const prod = l.productId ? byId.get(l.productId) : null;
          const lineMargin = prod?.cost && n(l.unitPrice) > 0 ? ((n(l.unitPrice) / (1 + (p.defaults.inclusive ? rate : 0)) - Number(prod.cost)) / (n(l.unitPrice) / (1 + (p.defaults.inclusive ? rate : 0)))) * 100 : null;
          return (
            <div key={i} className="space-y-2 rounded-2xl border border-border bg-card p-3">
              <div className="flex gap-2">
                <Select
                  value={l.productId}
                  onChange={(e) => {
                    const x = byId.get(e.target.value);
                    update(i, { productId: e.target.value, description: x?.name ?? l.description, unitPrice: x?.price || l.unitPrice });
                  }}
                  className="flex-1"
                >
                  <option value="">بند حر (خدمة / مو في المخزون)</option>
                  {p.products.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.isBox ? "🎁 " : ""}
                      {x.name}
                    </option>
                  ))}
                </Select>
                {lines.length > 1 && (
                  <button type="button" aria-label="حذف" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="grid size-12 place-items-center text-danger">
                    <Trash2 className="size-5" />
                  </button>
                )}
              </div>
              <Input value={l.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="الوصف اللي بيظهر للعميل" />
              <div className="grid grid-cols-2 gap-2">
                <Input inputMode="numeric" value={l.quantity} onChange={(e) => update(i, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} className="num" aria-label="الكمية" />
                <Input inputMode="decimal" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} placeholder="سعر الوحدة" className="num" />
              </div>
              {prod && (
                <p className={cn("text-xs", lineMargin !== null && lineMargin < 40 ? "text-warn" : "text-muted")}>
                  {prod.cost ? (
                    <>
                      التكلفة <span className="num">{prod.cost}</span>
                      {lineMargin !== null && <> · الهامش <span className="num">{lineMargin.toFixed(1)}%</span></>}
                    </>
                  ) : (
                    "ما فيه تكلفة معروفة — حط تكلفة تقديرية في صفحة المنتج"
                  )}
                </p>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => setLines((ls) => [...ls, { productId: "", description: "", quantity: 1, unitPrice: "" }])} className="w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted">
          + بند
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="خصم">
          <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="num" />
        </Field>
        <Field label="شحن وتوصيل">
          <Input inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} className="num" />
        </Field>
        <Field label="العربون %">
          <Input inputMode="numeric" value={depositPct} onChange={(e) => setDeposit(e.target.value)} className="num" />
        </Field>
        <Field label="صالح (أيام)">
          <Input inputMode="numeric" value={validityDays} onChange={(e) => setValidity(e.target.value)} className="num" />
        </Field>
      </div>
      <Field label="الشروط">
        <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} />
      </Field>

      <div className="space-y-1 rounded-2xl bg-subtle p-3 text-sm">
        <div className="flex justify-between text-base font-bold">
          <span>الإجمالي</span>
          <span className="num">{fmt(total)}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>العربون {depositPct}%</span>
          <span className="num">{fmt((total * n(depositPct)) / 100)}</span>
        </div>
        <div className={cn("flex justify-between", margin < 40 ? "text-warn" : "text-muted")}>
          <span>الهامش التقديري{unknownCost ? " (بعض البنود بدون تكلفة)" : ""}</span>
          <span className="num">{fmt(net - cost)} ({margin.toFixed(1)}%)</span>
        </div>
      </div>
      <FormError state={state} />
      <SubmitButton size="lg">حفظ العرض</SubmitButton>
    </form>
  );
}
