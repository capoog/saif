"use client";

import { ShieldAlert } from "lucide-react";
import type { ActionState } from "@/server/actions/run";
import { Textarea } from "./ui";

/**
 * لما العملية تتعترض بقاعدة: بيعرض السبب بالأرقام، وخانة "سبب التجاوز".
 * الفورم نفسه ينرسل ثاني بالسبب، والتجاوز يتسجل في سجل التعديلات.
 */
export function OverrideField({ state }: { state: ActionState }) {
  if (!state.violations?.length) return null;
  return (
    <div className="space-y-2 rounded-xl border-2 border-danger/50 bg-danger-bg p-3 text-sm">
      <div className="flex items-center gap-2 font-bold text-danger">
        <ShieldAlert className="size-5" /> القواعد بتعترض على العملية هذي
      </div>
      <ul className="space-y-1.5">
        {state.violations.map((v, i) => (
          <li key={i}>
            <div className="font-semibold">{v.title}</div>
            <div className="text-xs opacity-90">{v.detail}</div>
          </li>
        ))}
      </ul>
      <label className="block space-y-1">
        <span className="text-xs font-semibold">لو متأكد، اكتب سبب التجاوز (بيتسجل في السجل) واحفظ مرة ثانية:</span>
        <Textarea name="override" required rows={2} className="bg-card" placeholder="مثلًا: الطلب مدفوع مقدمًا بالكامل" />
      </label>
    </div>
  );
}
