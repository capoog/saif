"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/server/actions/auth";
import { Field, Input } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

export function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="البريد الإلكتروني">
        <Input name="email" type="email" autoComplete="username" required defaultValue={state.email} dir="ltr" />
      </Field>
      <Field label="كلمة المرور">
        <Input name="password" type="password" autoComplete="current-password" required dir="ltr" />
      </Field>
      {state.needCode && (
        <Field label="كود التحقق الثنائي" hint="من تطبيق المصادقة (6 أرقام)">
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus dir="ltr" />
        </Field>
      )}
      <FormError state={state} />
      <SubmitButton size="lg" pendingText="جاري الدخول…">دخول</SubmitButton>
    </form>
  );
}
