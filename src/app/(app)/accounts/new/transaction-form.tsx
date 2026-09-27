"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createTransactionAction } from "@/server/actions/accounts";
import type { ActionState } from "@/server/actions/run";
import { Field, Input, Select, cn } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";
import { OverrideField } from "@/components/override";
import { resetForm } from "@/components/form-reset-guard";

type TxType = "DEPOSIT" | "WITHDRAWAL" | "TRANSFER" | "EXPENSE";
const TYPES: { value: TxType; label: string }[] = [
  { value: "EXPENSE", label: "مصروف" },
  { value: "DEPOSIT", label: "إيداع" },
  { value: "WITHDRAWAL", label: "سحب" },
  { value: "TRANSFER", label: "تحويل" },
];

interface Props {
  initialType: TxType;
  accounts: { id: string; name: string; code: string; balance: string }[];
  engines: { id: string; name: string; code: string }[];
  expenseCategories: { code: string; label: string }[];
  depositSources: { code: string; label: string }[];
  withdrawalPurposes: { code: string; label: string }[];
}

export function TransactionForm(p: Props) {
  const [type, setType] = useState<TxType>(p.initialType);
  const [state, action] = useActionState<ActionState, FormData>(createTransactionAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  // "حفظ + التالي": نفضّي الفورم بعد النجاح عشان الإدخال المتتالي يبقى سريع
  useEffect(() => {
    if (state.ok && state.message) resetForm(formRef.current);
  }, [state]);
  const categories = type === "EXPENSE" ? p.expenseCategories : type === "DEPOSIT" ? p.depositSources : type === "WITHDRAWAL" ? p.withdrawalPurposes : [];
  const bank = p.accounts.find((a) => a.code === "BANK")?.id;

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="type" value={type} />
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-subtle p-1">
        {TYPES.map((t) => (
          <button key={t.value} type="button" onClick={() => setType(t.value)} className={cn("h-10 rounded-lg text-sm font-semibold", type === t.value ? "bg-card shadow" : "text-muted")}>
            {t.label}
          </button>
        ))}
      </div>

      <Field label="المبلغ (ريال)">
        <Input name="amount" inputMode="decimal" required autoFocus placeholder="0.00" className="num h-14 text-2xl font-bold" />
      </Field>

      {categories.length > 0 && (
        <Field label={type === "EXPENSE" ? "التصنيف" : type === "DEPOSIT" ? "مصدر الإيداع" : "الغرض"}>
          <div className="flex flex-wrap gap-2">
            {categories.map((c, i) => (
              <label key={c.code} className="cursor-pointer">
                <input type="radio" name="category" value={c.code} defaultChecked={i === 0} className="peer sr-only" />
                <span className="inline-block rounded-full border border-border px-3 py-2 text-sm peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:font-semibold peer-checked:text-primary">{c.label}</span>
              </label>
            ))}
          </div>
        </Field>
      )}

      <Field label={type === "DEPOSIT" ? "إلى حساب" : "من حساب"}>
        <Select name="accountId" defaultValue={bank}>
          {p.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.balance})
            </option>
          ))}
        </Select>
      </Field>

      {type === "TRANSFER" && (
        <Field label="إلى حساب">
          <Select name="toAccountId" defaultValue={p.accounts.find((a) => a.code === "CASH_BOX")?.id}>
            {p.accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
      )}

      {(type === "EXPENSE" || type === "DEPOSIT") && (
        <Field label="المحرك" hint="عشان التقارير والعائد لكل محرك">
          <Select name="engineId" defaultValue={type === "EXPENSE" ? p.engines.find((e) => e.code === "ECOM")?.id : ""}>
            <option value="">بدون</option>
            {p.engines.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </Select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="التاريخ">
          <Input name="date" type="date" defaultValue={new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10)} />
        </Field>
        <Field label="ملاحظة">
          <Input name="note" placeholder="اختياري" />
        </Field>
      </div>

      <OverrideField state={state} />
      <FormError state={state} />
      {state.message && <div className="rounded-xl bg-ok-bg px-3 py-2 text-sm text-ok">{state.message}</div>}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <SubmitButton size="lg">حفظ</SubmitButton>
        <SubmitButton size="lg" variant="secondary" name="again" value="1" className="w-auto">حفظ + التالي</SubmitButton>
      </div>
    </form>
  );
}
