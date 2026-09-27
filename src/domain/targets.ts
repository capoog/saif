import { planDay, PLAN_TOTAL_DAYS } from "./plan-calendar";
import { D, Decimal, round2, type DecimalLike } from "./money";

export interface TargetRow {
  week: number;
  startCapitalTarget: DecimalLike;
  endCapitalTarget: DecimalLike;
}

/**
 * الهدف الخطي لليوم: بين بداية ونهاية هدف الأسبوع حسب عدد الأيام اللي خلصت من الأسبوع.
 * آخر يوم في الأسبوع = هدف نهاية الأسبوع.
 */
export function targetForDate(targets: TargetRow[], date: Date): { week: number; today: Decimal; weekEnd: Decimal } {
  const sorted = [...targets].sort((a, b) => a.week - b.week);
  if (sorted.length === 0) throw new Error("لا توجد أهداف أسبوعية");
  const day = Math.min(Math.max(planDay(date), 1), PLAN_TOTAL_DAYS);
  const week = Math.floor((day - 1) / 7) + 1;
  const row = sorted.find((t) => t.week === week) ?? sorted[sorted.length - 1];
  const daysInWeek = Math.min(week * 7, PLAN_TOTAL_DAYS) - (week - 1) * 7;
  const dayInWeek = day - (week - 1) * 7;
  const start = D(row.startCapitalTarget);
  const end = D(row.endCapitalTarget);
  const today = planDay(date) < 1 ? start : start.plus(end.minus(start).times(dayInWeek).div(daysInWeek));
  return { week: row.week, today: round2(today), weekEnd: round2(end) };
}
