import { D, Decimal, round2, sum, type DecimalLike } from "./money";

export interface LineInput {
  accountCode: string;
  debit?: DecimalLike;
  credit?: DecimalLike;
  engineId?: string | null;
  memo?: string;
}

export class UnbalancedEntryError extends Error {}

/** يتأكد إن القيد متوازن (مدين = دائن) وكل سطر فيه طرف واحد موجب. */
export function validateLines(lines: LineInput[]): { debit: Decimal; credit: Decimal } {
  if (lines.length < 2) throw new UnbalancedEntryError("القيد لازم يكون فيه سطرين على الأقل");
  for (const l of lines) {
    const d = round2(D(l.debit));
    const c = round2(D(l.credit));
    if (d.lt(0) || c.lt(0)) throw new UnbalancedEntryError("مبالغ القيد لازم تكون موجبة");
    if (d.gt(0) && c.gt(0)) throw new UnbalancedEntryError("السطر الواحد يا مدين يا دائن");
  }
  const debit = round2(sum(lines.map((l) => D(l.debit))));
  const credit = round2(sum(lines.map((l) => D(l.credit))));
  if (!debit.eq(credit)) throw new UnbalancedEntryError(`القيد غير متوازن: مدين ${debit} ≠ دائن ${credit}`);
  if (debit.isZero()) throw new UnbalancedEntryError("قيد بقيمة صفر");
  return { debit, credit };
}

/** يشيل الأسطر الصفرية (مفيدة لما مبلغ زي الضريبة يطلع صفر) */
export function dropZeroLines(lines: LineInput[]): LineInput[] {
  return lines.filter((l) => !round2(D(l.debit)).isZero() || !round2(D(l.credit)).isZero());
}

export type NormalSide = "debit" | "credit";
export function normalSide(type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE"): NormalSide {
  return type === "ASSET" || type === "EXPENSE" ? "debit" : "credit";
}
