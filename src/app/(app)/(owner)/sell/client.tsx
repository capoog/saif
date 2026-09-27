"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { quickSaleAction } from "@/server/actions/businesses";
import type { ActionState } from "@/server/actions/run";
import { Input, cn } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

type P = { id: string; name: string; category: string; price: number };
const METHODS = [
  { code: "cash", label: "نقد" },
  { code: "mada", label: "شبكة" },
  { code: "transfer", label: "تحويل" },
];
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function QuickSale({ engineId, products }: { engineId: string; products: P[] }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState("cash");
  const [discount, setDiscount] = useState("");
  const [state, action] = useActionState<ActionState, FormData>(quickSaleAction, {});
  useEffect(() => {
    if (state.ok) {
      setCart({});
      setDiscount("");
    }
  }, [state]);
  const add = (id: string, d: number) => setCart((c) => ({ ...c, [id]: Math.max((c[id] ?? 0) + d, 0) }));
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  const total = useMemo(() => items.reduce((s, [id, q]) => s + q * (products.find((p) => p.id === id)?.price ?? 0), 0) - (Number(discount) || 0), [items, products, discount]);
  const cats = [...new Set(products.map((p) => p.category))];

  return (
    <div className="space-y-3 pb-40">
      {cats.map((c) => (
        <div key={c}>
          {cats.length > 1 && <div className="mb-1 text-xs font-semibold text-muted">{c}</div>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {products
              .filter((p) => p.category === c)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => add(p.id, 1)}
                  className={cn("relative rounded-2xl border bg-card p-3 text-start active:scale-95", cart[p.id] ? "border-primary" : "border-border")}
                >
                  <div className="font-semibold leading-tight">{p.name}</div>
                  <div className="num mt-1 text-sm text-muted">{fmt(p.price)}</div>
                  {cart[p.id] > 0 && <span className="num absolute end-2 top-2 rounded-full bg-primary px-2 text-sm font-bold text-primary-fg">{cart[p.id]}</span>}
                </button>
              ))}
          </div>
        </div>
      ))}

      <form action={action} className="fixed inset-x-0 bottom-16 z-20 border-t border-border bg-card p-3 shadow-lg md:bottom-0 md:start-60">
        <div className="mx-auto max-w-2xl space-y-2">
          <input type="hidden" name="engineId" value={engineId} />
          <input type="hidden" name="method" value={method} />
          <input type="hidden" name="items" value={JSON.stringify(items.map(([productId, quantity]) => ({ productId, quantity })))} />
          {items.length > 0 && (
            <div className="max-h-28 space-y-1 overflow-y-auto text-sm">
              {items.map(([id, q]) => {
                const p = products.find((x) => x.id === id)!;
                return (
                  <div key={id} className="flex items-center justify-between">
                    <span>{p.name}</span>
                    <span className="flex items-center gap-2">
                      <button type="button" onClick={() => add(id, -1)} className="rounded-lg border border-border p-1" aria-label="إنقاص">
                        <Minus className="size-3.5" />
                      </button>
                      <span className="num w-6 text-center">{q}</span>
                      <button type="button" onClick={() => add(id, 1)} className="rounded-lg border border-border p-1" aria-label="زيادة">
                        <Plus className="size-3.5" />
                      </button>
                      <span className="num w-20 text-end">{fmt(q * p.price)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            {METHODS.map((m) => (
              <button key={m.code} type="button" onClick={() => setMethod(m.code)} className={cn("h-10 whitespace-nowrap rounded-xl border text-sm", method === m.code ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border")}>
                {m.label}
              </button>
            ))}
            <Input name="discount" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="خصم" inputMode="decimal" className="num h-10" />
          </div>
          <FormError state={state} />
          {state.ok && state.message && <p className="text-sm text-ok">{state.message}</p>}
          <SubmitButton size="lg" disabled={items.length === 0}>
            تسجيل البيع · <span className="num">{fmt(Math.max(total, 0))}</span>
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
