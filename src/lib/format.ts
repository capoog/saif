const moneyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

type Num = string | number | { toString(): string } | null | undefined;

/** 1,234.56 — للعرض فقط (الحسابات كلها Decimal) */
export function money(v: Num): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v.toString());
  return Number.isFinite(n) ? moneyFmt.format(n) : "—";
}

export function int(v: Num): string {
  if (v === null || v === undefined) return "—";
  return intFmt.format(Number(v.toString()));
}

export function pct(v: Num, digits = 1): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v.toString());
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function date(d: Date | string | null | undefined): string {
  return d ? dateFmt.format(new Date(d)) : "—";
}

export function dateTime(d: Date | string | null | undefined): string {
  return d ? dateTimeFmt.format(new Date(d)) : "—";
}
