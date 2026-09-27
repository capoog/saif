"use client";

import { useActionState } from "react";
import { createUserAction, payCommissionAction, updateUserAction } from "@/server/actions/users";
import type { ActionState } from "@/server/actions/run";
import { Badge, Field, Input, Select } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";
import { OverrideField } from "@/components/override";

type U = { id: string; name: string; email: string; role: string; active: boolean; commissionPct: string; freelancer: string | null; due: string };
const ROLE: Record<string, string> = { owner: "المالك", sales: "مندوب مبيعات", freelancer: "مستقل" };

export function UsersPanel({ users, freelancers, accounts }: { users: U[]; freelancers: { id: string; name: string }[]; accounts: { id: string; name: string; code: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(createUserAction, {});
  return (
    <div className="space-y-4">
      <div className="divide-y divide-border">
        {users.map((u) => (
          <UserRow key={u.id} u={u} accounts={accounts} />
        ))}
      </div>
      <form action={action} className="space-y-3 rounded-xl bg-subtle p-3">
        <div className="text-sm font-semibold">حساب جديد</div>
        <div className="grid grid-cols-2 gap-2">
          <Input name="name" placeholder="الاسم" required />
          <Select name="role" defaultValue="sales">
            <option value="sales">مندوب مبيعات</option>
            <option value="freelancer">مستقل</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input name="email" type="email" placeholder="الإيميل" required dir="ltr" />
          <Input name="password" type="text" placeholder="كلمة مرور (10+)" required dir="ltr" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="عمولة المندوب %" hint="من صافي الصفقة بعد التحصيل الكامل">
            <Input name="commissionPct" inputMode="decimal" className="num" />
          </Field>
          <Field label="المستقل (لحساب مستقل)">
            <Select name="freelancerId" defaultValue="">
              <option value="">—</option>
              {freelancers.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-xs text-muted">المندوب يشوف عملاءه وصفقاته وعروضه بس. المستقل يشوف مهامه بس. ولا واحد منهم يشوف رأس المال أو الأرباح.</p>
        <FormError state={state} />
        {state.ok && <p className="text-sm text-ok">{state.message}</p>}
        <SubmitButton size="sm">إضافة</SubmitButton>
      </form>
    </div>
  );
}

function UserRow({ u, accounts }: { u: U; accounts: { id: string; name: string; code: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(updateUserAction, {});
  const [payState, pay] = useActionState<ActionState, FormData>(payCommissionAction, {});
  return (
    <div className="space-y-2 py-3 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium">{u.name}</span> <span className="text-xs text-muted" dir="ltr">{u.email}</span>
          <div className="mt-0.5 flex gap-1">
            <Badge>{ROLE[u.role]}</Badge>
            {u.freelancer && <Badge>{u.freelancer}</Badge>}
            {!u.active && <Badge tone="danger">موقوف</Badge>}
          </div>
        </div>
        {u.role !== "owner" && (
          <form action={action}>
            <input type="hidden" name="id" value={u.id} />
            <input type="hidden" name="active" value={u.active ? "0" : "1"} />
            <SubmitButton size="sm" variant="ghost" pendingText="…">{u.active ? "إيقاف" : "تفعيل"}</SubmitButton>
          </form>
        )}
      </div>
      {u.role !== "owner" && (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={u.id} />
          {u.role === "sales" && <Input name="commissionPct" defaultValue={u.commissionPct} inputMode="decimal" className="num h-9 w-20" aria-label="العمولة %" />}
          <Input name="password" placeholder="كلمة مرور جديدة" className="h-9 w-40" dir="ltr" />
          <SubmitButton size="sm" variant="secondary" pendingText="…">حفظ</SubmitButton>
          <FormError state={state} />
        </form>
      )}
      {u.role === "sales" && Number(u.due) > 0 && (
        <form action={pay} className="flex flex-wrap items-center gap-2 rounded-lg bg-warn-bg p-2">
          <input type="hidden" name="salesUserId" value={u.id} />
          <span className="text-xs text-warn">عمولة مستحقة <span className="num font-semibold">{u.due}</span></span>
          <Input name="amount" defaultValue={u.due} inputMode="decimal" className="num h-9 w-28" />
          <Select name="accountId" defaultValue={accounts.find((a) => a.code === "BANK")?.id} className="h-9 w-36 text-sm">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <SubmitButton size="sm" pendingText="…">سداد</SubmitButton>
          <OverrideField state={payState} />
          <FormError state={payState} />
        </form>
      )}
    </div>
  );
}
