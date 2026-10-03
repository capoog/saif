"use client";

import { useActionState, useState } from "react";
import { resetChallengeAction } from "@/server/actions/reset";
import type { ActionState } from "@/server/actions/run";
import { Button, Field, Input } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

export function ResetChallenge({ startKey, todayKey }: { startKey: string; todayKey: string }) {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [state, action] = useActionState<ActionState, FormData>(resetChallengeAction, {});
  if (!open)
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted">
          التحدي بدأ يوم <span className="num">{startKey}</span>. التصفير يمسح كل شي ويبدأ اليوم 1 من جديد برأس مال 20,000.
        </p>
        <Button type="button" variant="danger" onClick={() => setOpen(true)}>
          تصفير التحدي
        </Button>
      </div>
    );
  return (
    <form action={action} className="space-y-3">
      <div className="rounded-xl bg-danger-bg p-3 text-sm text-danger">
        <b>انتبه: ما فيه رجوع.</b> بينمسح كل شي: الطلبات، الحسابات والحركات، المخزون، العملاء، الموردين، المنتجات، الأنشطة اللي أضفتها، السيارات، الوكالة،
        المشاريع، الإغلاقات، الإعدادات، وحسابات المناديب والمستقلين.
        <br />
        يرجع البنك 20,000، والـ 56 منتج الأساسية وأهداف الأسابيع، و<b>اليوم 1 = اليوم ({todayKey})</b>. يبقى بس حسابك أنت للدخول.
      </div>
      <p className="text-xs text-muted">
        تبي نسخة قبل؟ نزّل{" "}
        <a href="/api/reports?key=all&format=xlsx" className="text-primary">
          ملف Excel بكل التقارير
        </a>{" "}
        أول.
      </p>
      <Field label="اكتب كلمة «تصفير» للتأكيد">
        <Input name="phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
      </Field>
      <Field label="كلمة المرور">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton variant="danger" disabled={phrase.trim() !== "تصفير"} pendingText="جاري التصفير…">
          صفّر وابدأ من اليوم
        </SubmitButton>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
