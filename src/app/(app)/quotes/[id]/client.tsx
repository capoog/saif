"use client";

import { useActionState, useState } from "react";
import { FileDown, Printer, Share2 } from "lucide-react";
import { createContractAction, setQuoteStatusAction } from "@/server/actions/quotes";
import type { ActionState } from "@/server/actions/run";
import { Button, Field, Input } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";
import { OverrideField } from "@/components/override";

const today = (plus = 0) => new Date(Date.now() + 3 * 3600000 + plus * 86400000).toISOString().slice(0, 10);

export function QuoteActions({ id, label, status, phone, total }: { id: string; label: string; status: string; phone: string | null; total: string }) {
  const [state, action] = useActionState<ActionState, FormData>(setQuoteStatusAction, {});
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/quotes/${id}/pdf`);
      const blob = await res.blob();
      const file = new File([blob], `${label}.pdf`, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `عرض سعر ${label}` });
      else window.open(`/quotes/${id}/pdf`, "_blank");
    } catch {
      /* المستخدم لغى المشاركة */
    } finally {
      setBusy(false);
    }
  };
  const status_ = (s: string, text: string, variant: "primary" | "secondary" | "ghost" = "secondary") => (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={s} />
      <SubmitButton size="sm" variant={variant}>{text}</SubmitButton>
    </form>
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={share} disabled={busy}>
          <Share2 className="size-4" /> {busy ? "جاري التجهيز…" : "مشاركة PDF (واتساب)"}
        </Button>
        <a href={`/quotes/${id}/pdf`} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-subtle px-3 text-sm font-semibold">
          <FileDown className="size-4" /> PDF
        </a>
        <a href={`/quotes/${id}/print`} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-xl px-3 text-sm text-muted">
          <Printer className="size-4" /> طباعة
        </a>
        {phone && (
          <a
            href={`https://wa.me/966${phone.replace(/^0/, "")}?text=${encodeURIComponent(`السلام عليكم، مرفق عرض السعر ${label} بإجمالي ${Number(total).toLocaleString("en-US")} ريال.`)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center rounded-xl px-3 text-sm text-muted"
          >
            رسالة واتساب
          </a>
        )}
      </div>
      {status !== "ACCEPTED" && (
        <div className="flex flex-wrap gap-2">
          {status !== "SENT" && status_("SENT", "انرسل للعميل ✓")}
          {status !== "REJECTED" && status_("REJECTED", "العميل رفض", "ghost")}
        </div>
      )}
      <FormError state={state} />
    </div>
  );
}

export function ContractForm({ quoteId, items }: { quoteId: string; items: { description: string; quantity: number }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(createContractAction, {});
  const [signedAt, setSignedAt] = useState(today());
  const [deliveries, setDeliveries] = useState([{ date: today(7), quantities: items.map((i) => i.quantity) }]);
  const setQty = (d: number, i: number, v: number) => setDeliveries((ds) => ds.map((x, j) => (j === d ? { ...x, quantities: x.quantities.map((q, k) => (k === i ? v : q)) } : x)));
  const planned = items.map((_, i) => deliveries.reduce((s, d) => s + (d.quantities[i] || 0), 0));
  const mismatch = planned.some((p, i) => p !== items[i].quantity);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="payload" value={JSON.stringify({ quoteId, signedAt, deliveries })} />
      <Field label="تاريخ التوقيع">
        <Input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
      </Field>
      <div className="space-y-2">
        <div className="text-sm font-medium">جدول التسليم</div>
        {deliveries.map((d, di) => (
          <div key={di} className="space-y-2 rounded-xl bg-subtle p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">دفعة {di + 1}</span>
              <Input type="date" value={d.date} onChange={(e) => setDeliveries((ds) => ds.map((x, j) => (j === di ? { ...x, date: e.target.value } : x)))} className="h-10 flex-1" />
              {deliveries.length > 1 && (
                <button type="button" onClick={() => setDeliveries((ds) => ds.filter((_, j) => j !== di))} className="text-sm text-danger">
                  حذف
                </button>
              )}
            </div>
            {items.map((it, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{it.description}</span>
                <Input inputMode="numeric" value={d.quantities[i]} onChange={(e) => setQty(di, i, Math.max(0, parseInt(e.target.value) || 0))} className="num h-10 w-24" />
              </div>
            ))}
          </div>
        ))}
        <button type="button" onClick={() => setDeliveries((ds) => [...ds, { date: today(14), quantities: items.map(() => 0) }])} className="w-full rounded-xl border border-dashed border-border py-2 text-sm text-muted">
          + دفعة تسليم
        </button>
        {mismatch && <p className="text-xs text-danger">مجموع الدفعات لازم يساوي كمية العرض: {items.map((it, i) => `${it.description} ${planned[i]}/${it.quantity}`).join("، ")}</p>}
      </div>
      <p className="text-xs text-muted">كل دفعة تتسجل طلب مؤكد. العربون بتسجله من صفحة العقد بعد كذا، وبيفضل التزام لين التسليم.</p>
      <OverrideField state={state} />
      <FormError state={state} />
      <SubmitButton disabled={mismatch}>إنشاء العقد</SubmitButton>
    </form>
  );
}
