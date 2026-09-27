"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./ui";
import type { ComponentProps } from "react";

export function SubmitButton({ children, pendingText = "جاري الحفظ…", ...props }: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}

export function FormError({ state }: { state: { error?: string; violations?: unknown[] } | undefined }) {
  if (!state?.error || state.violations?.length) return null;
  return <div className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</div>;
}
