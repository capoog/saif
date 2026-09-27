"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { closeWeekAction, reconcileAllAction, stockCountAction } from "@/server/actions/close";
import type { ActionState } from "@/server/actions/run";
import { Alert, Badge, Button, Card, Field, Input, Money, Textarea, cn } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

interface Props {
  week: number;
  existing: { week: number } | null;
  accounts: { id: string; name: string; balance: string }[];
  products: { id: string; name: string; onHand: number }[];
  draft: {
    capital: string;
    target: string;
    gap: string;
    gapPct: string;
    status: string;
    statusLabel: string;
    tone: "ok" | "info" | "warn" | "danger";
    suggested: string;
    lines: [string, string][];
  };
}

const STEPS = ["الأرصدة", "الجرد", "رأس المال", "المقارنة", "القرار"];

function Done({ state }: { state: ActionState }) {
  return state.ok && state.message ? <Alert tone="ok">{state.message}</Alert> : null;
}

export function CloseWizard({ week, existing, accounts, products, draft }: Props) {
  const [step, setStep] = useState(0);
  const [recState, recAction] = useActionState<ActionState, FormData>(reconcileAllAction, {});
  const [cntState, cntAction] = useActionState<ActionState, FormData>(stockCountAction, {});
  const [closeState, closeAction] = useActionState<ActionState, FormData>(closeWeekAction, {});

  return (
    <div className="space-y-4">
      {existing && (
        <Alert tone="info" title={`أسبوع ${week} متقفل بالفعل`}>
          <Link href={`/close/${week}`} className="underline">اعرض الـ Snapshot</Link> — إعادة الإغلاق بتحتاج سبب وبتتسجل في سجل التعديلات.
        </Alert>
      )}
      <div className="grid grid-cols-5 gap-1">
        {STEPS.map((s, i) => (
          <button key={s} type="button" onClick={() => setStep(i)} className={cn("rounded-lg py-2 text-xs", i === step ? "bg-primary font-semibold text-primary-fg" : i < step ? "bg-primary/15 text-primary" : "bg-subtle text-muted")}>
            <span className="num">{i + 1}</span>. {s}
          </button>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <p className="mb-3 text-sm text-muted">اكتب الرصيد الفعلي لكل حساب (من تطبيق البنك / عدّ الصندوق). أي فرق بيتسجل «فروقات مطابقة».</p>
          <form action={recAction} className="space-y-3">
            {accounts.map((a) => (
              <Field key={a.id} label={a.name} hint={<>في النظام: <span className="num">{a.balance}</span></>}>
                <Input name={`actual_${a.id}`} inputMode="decimal" defaultValue={a.balance} className="num" />
              </Field>
            ))}
            <FormError state={recState} />
            <Done state={recState} />
            <div className="flex gap-2">
              <SubmitButton>تأكيد الأرصدة</SubmitButton>
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>التالي ←</Button>
            </div>
          </form>
        </Card>
      )}

      {step === 1 && (
        <Card>
          {products.length === 0 ? (
            <p className="text-sm text-muted">مفيش مخزون حاليًا.</p>
          ) : (
            <form action={cntAction} className="space-y-3">
              <p className="text-sm text-muted">عدّل الكمية لو الفعلي مختلف. النقص بيتخصم FIFO كمصروف «فروقات جرد».</p>
              {products.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{p.name}</span>
                  <Input name={`count_${p.id}`} inputMode="numeric" defaultValue={p.onHand} className="num w-24" />
                </div>
              ))}
              <FormError state={cntState} />
              <Done state={cntState} />
              <SubmitButton>تأكيد الجرد</SubmitButton>
            </form>
          )}
          <Button type="button" variant="ghost" className="mt-2" onClick={() => setStep(2)}>التالي ←</Button>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <div className="divide-y divide-border text-sm">
            {draft.lines.map(([label, v]) => (
              <div key={label} className="flex justify-between py-2">
                <span>{label}</span>
                <Money value={v} />
              </div>
            ))}
            <div className="flex justify-between py-3 text-lg font-bold">
              <span>رأس المال</span>
              <Money value={draft.capital} />
            </div>
          </div>
          <p className="text-xs text-muted">مخصص زكاة الشهر بيتحسب تلقائيًا عند الحفظ لو لسه متحسبش (تقديري).</p>
          <Button type="button" variant="ghost" className="mt-2" onClick={() => setStep(3)}>التالي ←</Button>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-sm">هدف نهاية الأسبوع</span>
            <Money value={draft.target} className="font-semibold" />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm">الفارق</span>
            <span className="flex items-center gap-2">
              <Money value={draft.gap} className="font-semibold" />
              <Badge tone={draft.tone}>
                <span className="num">{Number(draft.gapPct) > 0 ? "+" : ""}{draft.gapPct}%</span>
              </Badge>
            </span>
          </div>
          <div className="mt-4">
            <Alert tone={draft.tone} title={`القرار المقترح — ${draft.statusLabel}`}>{draft.suggested}</Alert>
          </div>
          <Button type="button" variant="ghost" className="mt-2" onClick={() => setStep(4)}>التالي ←</Button>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <form action={closeAction} className="space-y-3">
            <Field label="القرار الفعلي" hint="هيتحفظ مع الـ Snapshot">
              <Textarea name="actualDecision" defaultValue={draft.suggested} rows={4} />
            </Field>
            <input type="hidden" name="reconciliation" value={JSON.stringify({ accounts: recState.data ?? null, stock: cntState.message ?? null })} />
            {existing && (
              <>
                <input type="hidden" name="overwrite" value="1" />
                <Field label="سبب إعادة الإغلاق (إلزامي)">
                  <Input name="reason" required />
                </Field>
              </>
            )}
            <FormError state={closeState} />
            <SubmitButton size="lg">{existing ? "إعادة حفظ الـ Snapshot" : "حفظ وإغلاق الأسبوع"}</SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}
