"use client";

import { useEffect } from "react";

/**
 * React 19 بيعمل reset تلقائي لأي <form action> بعد ما الـ action يخلص — حتى لو رجع خطأ.
 * هذا بيرجّع القوائم (select) لأول اختيار وممكن العملية تتسجل على منتج غلط لما المستخدم يعيد الإرسال.
 * الحل: نلغي أي reset، إلا لو الكود طلبه صراحة بـ resetForm().
 */
export function FormResetGuard() {
  useEffect(() => {
    const onReset = (e: Event) => {
      const form = e.target as HTMLFormElement;
      if (form.dataset.resetOk === "1") {
        delete form.dataset.resetOk;
        return;
      }
      e.preventDefault();
    };
    document.addEventListener("reset", onReset, true);
    return () => document.removeEventListener("reset", onReset, true);
  }, []);
  return null;
}

/** reset مقصود (مثلًا بعد "حفظ + التالي") */
export function resetForm(form: HTMLFormElement | null) {
  if (!form) return;
  form.dataset.resetOk = "1";
  form.reset();
}
