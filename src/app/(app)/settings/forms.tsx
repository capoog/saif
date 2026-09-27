"use client";

import { useActionState, useState } from "react";
import type { Settings } from "@/domain/settings";
import { changePasswordAction, confirmTotpAction, disableTotpAction, startTotpAction, updateSettingsAction } from "@/server/actions/settings";
import type { ActionState } from "@/server/actions/run";
import { Button, Card, CardTitle, Field, Input } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/form-status";

type Key = keyof Settings;
const GROUPS: { title: string; fields: [Key, string, string?][] }[] = [
  {
    title: "الحالة مقابل الهدف",
    fields: [
      ["statusOnTargetPct", "نطاق «على الهدف» ±%"],
      ["statusDangerPct", "تحت الهدف بأكتر من % = أحمر"],
    ],
  },
  {
    title: "رأس المال والزكاة",
    fields: [
      ["receivableSecuredDays", "الذمم المضمونة (أيام تأخير بحد أقصى)"],
      ["zakatAnnualRatePct", "نسبة الزكاة السنوية %", "تتحسب شهريًا ÷ 12 — تقدير فقط"],
    ],
  },
  {
    title: "ضريبة القيمة المضافة",
    fields: [
      ["vatRatePct", "النسبة %"],
      ["vatRegistrationThreshold", "حد التسجيل الإلزامي (ريال)"],
    ],
  },
  {
    title: "قواعد المخاطر (تتفعّل بالكامل في المرحلة 2)",
    fields: [
      ["emergencyCapital", "وضع الطوارئ تحت (ريال)"],
      ["maxDealPct", "أقصى صفقة % من رأس المال"],
      ["maxCarDealPct", "أقصى صفقة سيارة %"],
      ["carDealUnlockCapital", "شراء السيارات من رأس مال (ريال)"],
      ["minLiquidityPct", "أقل سيولة % من رأس المال"],
      ["minLiquidityAbs", "أقل سيولة (ريال)"],
      ["maxInventoryPct", "أقصى مخزون %"],
      ["maxInventoryPctCovered", "أقصى مخزون مغطى بعرابين %"],
      ["dealLossRedPct", "خسارة صفقة حمراء %"],
      ["monthLossRedPct", "خسارة شهر حمراء %"],
      ["engineMinMonthlyReturnPct", "أقل عائد شهري لمحرك %"],
    ],
  },
  {
    title: "المخزون",
    fields: [
      ["batchWindowDays", "نافذة قياس البيع (يوم)"],
      ["batchSlowPct", "بيع بطيء أقل من %"],
      ["batchFastPct", "بيع سريع من %"],
      ["doubleMinRoas", "ROAS للمضاعفة"],
      ["doubleMinOrders", "أقل عدد طلبات للمضاعفة"],
      ["inventoryAgeMarkdownDays", "خفّض بعد (يوم)"],
      ["inventoryAgeLiquidateDays", "صفّي بعد (يوم)"],
    ],
  },
  {
    title: "قرارات الإغلاق و B2B",
    fields: [
      ["surplusToTopEnginePct", "% من الفائض للمحرك الأعلى"],
      ["onTargetAdBoostPct", "رفع ميزانية الإعلان الرابح %"],
      ["b2bDepositPct", "عربون B2B الافتراضي %"],
    ],
  },
];

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action] = useActionState<ActionState, FormData>(updateSettingsAction, {});
  return (
    <form action={action} className="space-y-4">
      <Card>
        <CardTitle>المنشأة والضريبة</CardTitle>
        <label className="mb-3 flex items-center gap-2 text-sm font-medium">
          <input type="hidden" name="vatRegistered__present" value="1" />
          <input type="checkbox" name="vatRegistered" defaultChecked={settings.vatRegistered} className="size-5" />
          مسجّل في ضريبة القيمة المضافة (الطلبات الجديدة هتحسب الضريبة)
        </label>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="hidden" name="pricesIncludeVat__present" value="1" />
          <input type="checkbox" name="pricesIncludeVat" defaultChecked={settings.pricesIncludeVat} className="size-5" />
          أسعار البيع شاملة الضريبة
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="اسم المنشأة"><Input name="businessName" defaultValue={settings.businessName} /></Field>
          <Field label="رقم السجل التجاري"><Input name="businessCr" defaultValue={settings.businessCr} dir="ltr" /></Field>
          <Field label="الرقم الضريبي"><Input name="businessVatNo" defaultValue={settings.businessVatNo} dir="ltr" /></Field>
          <Field label="الجوال"><Input name="businessPhone" defaultValue={settings.businessPhone} dir="ltr" /></Field>
        </div>
      </Card>
      {GROUPS.map((g) => (
        <Card key={g.title}>
          <CardTitle>{g.title}</CardTitle>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {g.fields.map(([key, label, hint]) => (
              <Field key={key} label={label} hint={hint}>
                <Input name={key} inputMode="decimal" defaultValue={String(settings[key])} className="num" />
              </Field>
            ))}
          </div>
        </Card>
      ))}
      <div className="sticky bottom-24 z-10 space-y-2 md:bottom-4">
        <FormError state={state} />
        {state.ok && <div className="rounded-xl bg-ok-bg px-3 py-2 text-sm text-ok">{state.message}</div>}
        <SubmitButton size="lg">حفظ الإعدادات</SubmitButton>
      </div>
    </form>
  );
}

export function TwoFactor({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [err, setErr] = useState<string>();
  const [confirmState, confirmAction] = useActionState<ActionState, FormData>(confirmTotpAction, {});
  const [disableState, disableAction] = useActionState<ActionState, FormData>(disableTotpAction, {});

  if (enabled || confirmState.ok) {
    return (
      <form action={disableAction} className="space-y-3">
        <p className="text-sm text-ok">مفعّل ✔</p>
        <Field label="لإلغائه اكتب كود من التطبيق">
          <Input name="code" inputMode="numeric" maxLength={6} dir="ltr" />
        </Field>
        <FormError state={disableState} />
        {disableState.ok && <p className="text-sm">{disableState.message}</p>}
        <SubmitButton variant="secondary" size="sm">إلغاء التحقق الثنائي</SubmitButton>
      </form>
    );
  }
  if (!setup) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted">استخدم Google Authenticator أو أي تطبيق مصادقة.</p>
        {err && <p className="text-sm text-danger">{err}</p>}
        <Button
          type="button"
          onClick={async () => {
            const r = await startTotpAction();
            if (r.ok) setSetup(r.data as { secret: string; qr: string });
            else setErr(r.error);
          }}
        >
          تفعيل
        </Button>
      </div>
    );
  }
  return (
    <form action={confirmAction} className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="QR" className="mx-auto rounded-xl bg-white p-2" width={220} height={220} />
      <p className="num break-all text-center text-xs text-muted">{setup.secret}</p>
      <Field label="الكود من التطبيق">
        <Input name="code" inputMode="numeric" maxLength={6} autoFocus dir="ltr" />
      </Field>
      <FormError state={confirmState} />
      <SubmitButton>تأكيد</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="space-y-3">
      <Field label="الحالية"><Input name="current" type="password" autoComplete="current-password" dir="ltr" /></Field>
      <Field label="الجديدة (10 حروف+)"><Input name="next" type="password" autoComplete="new-password" dir="ltr" /></Field>
      <FormError state={state} />
      {state.ok && <p className="text-sm text-ok">{state.message}</p>}
      <SubmitButton variant="secondary">تغيير</SubmitButton>
    </form>
  );
}
