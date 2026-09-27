import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Tone = "ok" | "info" | "warn" | "danger" | "neutral";

const toneClasses: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  info: "bg-info-bg text-info",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  neutral: "bg-subtle text-muted",
};

const toneText: Record<Tone, string> = { ok: "text-ok", info: "text-info", warn: "text-warn", danger: "text-danger", neutral: "" };

export function cn(...args: Parameters<typeof clsx>) {
  return clsx(...args);
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
const buttonVariants = {
  primary: "bg-primary text-primary-fg hover:opacity-90",
  secondary: "bg-subtle text-fg border border-border hover:bg-border/50",
  ghost: "text-fg hover:bg-subtle",
  danger: "bg-danger text-white hover:opacity-90",
};
const buttonSizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-4", lg: "h-14 px-5 text-lg w-full" };

type ButtonStyle = { variant?: keyof typeof buttonVariants; size?: keyof typeof buttonSizes };

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & ButtonStyle) {
  return <button className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)} {...props} />;
}

const fieldBase =
  "w-full rounded-xl border border-border bg-card px-3 text-fg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-12 text-base", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, "h-12 text-base", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-20 py-2 text-base", className)} {...props} />;
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted">{hint}</span>}
      {error && <span className="block text-xs text-danger">{error}</span>}
    </label>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-border bg-card p-4", className)} {...props} />;
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", toneClasses[tone], className)} {...props} />;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("num mt-1 text-end text-lg font-bold", tone && toneText[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div className={cn("rounded-xl px-3 py-2.5 text-sm", toneClasses[tone])}>
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={cn(title && "mt-0.5 opacity-90")}>{children}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">{children}</div>;
}

export function Money({ value, className }: { value: string | number | null | undefined; className?: string }) {
  const n = value === null || value === undefined ? null : Number(value);
  return (
    <span className={cn("num", n !== null && n < 0 && "text-danger", className)}>
      {n === null ? "—" : new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}
    </span>
  );
}
