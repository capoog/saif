import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type Money = Decimal;
export type DecimalLike = Decimal | string | number | { toString(): string };

/** يحوّل أي قيمة (بما فيها Prisma.Decimal) لـ Decimal. متستخدمش Number للفلوس. */
export function D(v: DecimalLike | null | undefined): Decimal {
  if (v === null || v === undefined) return new Decimal(0);
  if (v instanceof Decimal) return v;
  return new Decimal(v.toString());
}

export const ZERO = new Decimal(0);

export function round2(v: DecimalLike): Decimal {
  return D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sum(values: DecimalLike[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(D(v)), ZERO);
}

/** نص بخانتين عشريتين للتخزين في Decimal(14,2). */
export function toDb2(v: DecimalLike): string {
  return round2(v).toFixed(2);
}

export function toDb4(v: DecimalLike): string {
  return D(v).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
}
