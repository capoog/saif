"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { adjustStockAction, setRecipeAction, updateProductAction } from "@/server/actions/inventory";
import type { ActionState } from "@/server/actions/run";
import { PRODUCT_STATUS } from "@/lib/labels";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

export function Ok({ state }: { state: ActionState }) {
  return state.ok && state.message ? <div className="rounded-xl bg-ok-bg px-3 py-2 text-sm text-ok">{state.message}</div> : null;
}

export function ProductEditForm(p: { id: string; status: string; kind: string; unit: string; price: string; estimate: string; notes: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateProductAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={p.id} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="الحالة">
          <Select name="status" defaultValue={p.status}>
            {Object.entries(PRODUCT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="النوع">
          <Select name="kind" defaultValue={p.kind}>
            <option value="GOODS">منتج / مادة</option>
            <option value="BOX">بوكس بمكونات</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="الوحدة">
          <Input name="unit" defaultValue={p.unit} />
        </Field>
        <Field label="سعر البيع">
          <Input name="defaultSellPrice" inputMode="decimal" defaultValue={p.price} className="num" />
        </Field>
        <Field label="تكلفة تقديرية" hint="قبل أول شراء">
          <Input name="estimatedUnitCost" inputMode="decimal" defaultValue={p.estimate} className="num" />
        </Field>
      </div>
      <Field label="ملاحظات">
        <Textarea name="notes" defaultValue={p.notes} />
      </Field>
      <FormError state={state} />
      <Ok state={state} />
      <SubmitButton>حفظ</SubmitButton>
    </form>
  );
}

export function StockCountForm({ productId, onHand, unit }: { productId: string; onHand: string; unit: string }) {
  const [state, action] = useActionState<ActionState, FormData>(adjustStockAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <p className="text-sm text-muted">
        في النظام: <span className="num font-semibold text-fg">{onHand}</span> {unit}. النقص يتسجل مصروف «فروقات جرد» بتكلفة FIFO.
      </p>
      <Field label="الكمية الفعلية">
        <Input name="counted" inputMode="decimal" defaultValue={onHand} className="num" />
      </Field>
      <Field label="السبب">
        <Input name="note" placeholder="تالف، ضايع، عيّنة…" />
      </Field>
      <FormError state={state} />
      <Ok state={state} />
      <SubmitButton variant="secondary">تسجيل الجرد</SubmitButton>
    </form>
  );
}

type Material = { id: string; name: string; unit: string; category: string };

export function RecipeForm({ boxId, lines, materials }: { boxId: string; lines: { componentId: string; quantity: string }[]; materials: Material[] }) {
  const [state, action] = useActionState<ActionState, FormData>(setRecipeAction, {});
  const [rows, setRows] = useState(lines.length ? lines : [{ componentId: "", quantity: "1" }]);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="boxId" value={boxId} />
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_6rem_auto] gap-2">
          <Select name="componentId" value={r.componentId} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, componentId: e.target.value } : x)))}>
            <option value="">اختار مكوّن…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit})
              </option>
            ))}
          </Select>
          <Input name="quantity" inputMode="decimal" value={r.quantity} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} className="num" />
          <button type="button" aria-label="حذف" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="grid size-12 place-items-center text-danger">
            <Trash2 className="size-5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows((rs) => [...rs, { componentId: "", quantity: "1" }])} className="w-full rounded-xl border border-dashed border-border py-2 text-sm text-muted">
        + مكوّن
      </button>
      <p className="text-xs text-muted">المكونات منتجات عادية بمخزون (تمر بالكيلو، علب، كروت…). لو مكوّن مو موجود، أضفه من «+ منتج» الأول.</p>
      <FormError state={state} />
      <Ok state={state} />
      <SubmitButton>حفظ الوصفة</SubmitButton>
    </form>
  );
}
