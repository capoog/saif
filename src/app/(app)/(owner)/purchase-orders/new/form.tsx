"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { createPurchaseOrderAction } from "@/server/actions/suppliers";
import type { ActionState } from "@/server/actions/run";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

type Line = { productId: string; quantity: string; unitPrice: string };
const n = (v: string) => Number(v.replace(/,/g, "")) || 0;

export function POForm(p: {
  supplierId?: string;
  suppliers: { id: string; name: string }[];
  products: { id: string; name: string; unit: string; cost: string }[];
  shortfalls: { productId: string; quantity: string }[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(createPurchaseOrderAction, {});
  const [supplierId, setSupplierId] = useState(p.supplierId ?? p.suppliers[0].id);
  const blank = (): Line => ({ productId: p.products[0]?.id ?? "", quantity: "", unitPrice: p.products[0]?.cost ?? "" });
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [extra, setExtra] = useState("");
  const [expected, setExpected] = useState("");
  const [note, setNote] = useState("");
  const byId = new Map(p.products.map((x) => [x.id, x]));
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + n(l.quantity) * n(l.unitPrice), 0) + n(extra);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="payload" value={JSON.stringify({ supplierId, items: lines, extraCosts: extra, expectedAt: expected, note })} />
      <Field label="المورد">
        <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          {p.suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </Field>
      {p.shortfalls.length > 0 && (
        <button
          type="button"
          onClick={() => setLines(p.shortfalls.map((s) => ({ productId: s.productId, quantity: s.quantity, unitPrice: byId.get(s.productId)?.cost ?? "" })))}
          className="w-full rounded-xl bg-warn-bg py-2.5 text-sm font-semibold text-warn"
        >
          املا بالناقص لعقود B2B ({p.shortfalls.length} مادة)
        </button>
      )}
      {lines.map((l, i) => (
        <div key={i} className="space-y-2 rounded-2xl border border-border bg-card p-3">
          <div className="flex gap-2">
            <Select value={l.productId} onChange={(e) => update(i, { productId: e.target.value, unitPrice: byId.get(e.target.value)?.cost || l.unitPrice })} className="flex-1">
              {p.products.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </Select>
            {lines.length > 1 && (
              <button type="button" aria-label="حذف" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="grid size-12 place-items-center text-danger">
                <Trash2 className="size-5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input inputMode="decimal" placeholder={`الكمية (${byId.get(l.productId)?.unit ?? ""})`} value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} className="num" />
            <Input inputMode="decimal" placeholder="سعر الوحدة" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} className="num" />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted">
        + بند
      </button>
      <div className="grid grid-cols-2 gap-3">
        <Field label="شحن وجمارك (على الأمر)">
          <Input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} className="num" />
        </Field>
        <Field label="الاستلام المتوقع">
          <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </Field>
      </div>
      <Field label="ملاحظات">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="rounded-xl bg-subtle p-3 text-sm">
        الإجمالي <span className="num font-bold">{total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <FormError state={state} />
      <SubmitButton size="lg">حفظ الأمر</SubmitButton>
    </form>
  );
}
